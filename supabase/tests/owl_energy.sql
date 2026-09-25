-- =====================================================================
-- OWL GAMES — 아울 에너지 (스태미나) 검증
--   대상: 20260925000000_owl_energy.sql
--
--   실행: psql "<connection-string>" -f supabase/tests/owl_energy.sql
--         또는 Supabase SQL 편집기에 전체 붙여넣기
--   결과: 오류 없이 끝나면 통과 (섹션마다 NOTICE 로 요약 출력)
--
--   주의
--   · 전부 트랜잭션 안에서 돌고 마지막에 rollback 한다. 영구 변경 없음.
--     (테스트 유저 6명을 auth.users 에 잠깐 만들었다가 되돌린다)
--   · auth.uid() 를 흉내내려고 request.jwt.claim.sub 를 set_config(..., true) 로 잡는다.
--   · start_game_session() 은 운영시간 검사가 있어서 force_open 을 'open' 으로 잠깐 바꾼다
--     (트랜잭션 안이라 rollback 되면 원래 'auto' 로 복원된다).
-- =====================================================================

begin;
set local plpgsql.check_asserts = on;

-- ===== 0. 테스트 유저 준비 ============================================
do $$
declare
  c_uid    constant uuid := '0ee0e117-0000-4000-8000-000000000001';  -- 회복/소모 테스트
  c_staff  constant uuid := '0ee0e117-0000-4000-8000-000000000002';  -- 부스 스태프
  c_admin  constant uuid := '0ee0e117-0000-4000-8000-000000000003';  -- 관리자
  c_target constant uuid := '0ee0e117-0000-4000-8000-000000000004';  -- 부스 지급/admin_set 대상
  c_flight constant uuid := '0ee0e117-0000-4000-8000-000000000005';  -- 인게임 드랍 개별 조건
  c_daily  constant uuid := '0ee0e117-0000-4000-8000-000000000006';  -- 인게임 드랍 일일 상한
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (c_uid,    '999300001@owlgames.local', jsonb_build_object('name', '에너지테스트', 'student_id', '999300001')),
    (c_staff,  '999300002@owlgames.local', jsonb_build_object('name', '스태프테스트', 'student_id', '999300002')),
    (c_admin,  '999300003@owlgames.local', jsonb_build_object('name', '관리자테스트', 'student_id', '999300003')),
    (c_target, '999300004@owlgames.local', jsonb_build_object('name', '지급대상테스트', 'student_id', '999300004')),
    (c_flight, '999300005@owlgames.local', jsonb_build_object('name', '드랍조건테스트', 'student_id', '999300005')),
    (c_daily,  '999300006@owlgames.local', jsonb_build_object('name', '드랍상한테스트', 'student_id', '999300006'));

  update public.profiles set verified = true
   where id in (c_uid, c_staff, c_admin, c_target, c_flight, c_daily);
  update public.profiles set role = 'staff' where id = c_staff;
  update public.profiles set role = 'admin', verified = true where id = c_admin;

  -- start_game_session 테스트를 새벽에 돌려도 통과하도록 운영시간을 강제로 연다
  update public.app_config set value = to_jsonb('open'::text) where key = 'force_open';

  raise notice '테스트 유저 6명 준비 완료';
end $$;


-- ===== 1. 설정 시드 / 컬럼 확인 =======================================
do $$
declare
  v_cfg jsonb := public.cfg('owl_energy');
begin
  assert (v_cfg ->> 'regen_min')::int = 10,        format('regen_min 은 10: %s', v_cfg);
  assert (v_cfg ->> 'cap')::int = 10,               format('cap 은 10: %s', v_cfg);
  assert (v_cfg ->> 'hard_cap')::int = 20,          format('hard_cap 은 20: %s', v_cfg);
  assert (v_cfg ->> 'cost')::int = 1,               format('cost 는 1: %s', v_cfg);
  assert (v_cfg ->> 'drop_min_phase')::int = 3,     format('drop_min_phase 는 3: %s', v_cfg);
  assert (v_cfg ->> 'drop_min_distance')::int = 900, format('drop_min_distance 는 900: %s', v_cfg);
  assert (v_cfg ->> 'drop_daily_cap')::int = 5,     format('drop_daily_cap 은 5: %s', v_cfg);

  assert exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'owl_energy'
  ), 'profiles.owl_energy 컬럼이 없음';
  assert exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'owl_energy_at'
  ), 'profiles.owl_energy_at 컬럼이 없음';
  assert exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'energy_grants'
  ), 'energy_grants 테이블이 없음';

  raise notice '✅ 1. 설정 시드 / 스키마 확인';
end $$;


-- ===== 2. owl_energy_sync 회복 계산 ===================================
do $$
declare
  c_uid constant uuid := '0ee0e117-0000-4000-8000-000000000001';
  v_result int;
  v_row    public.profiles%rowtype;
  v_status jsonb;
begin
  -- 2.1 25분 경과, cap(10) 미만 → floor(25/10)=2 만큼만 충전, 나머지 5분은 보존
  --     (10분으로 리셋되면 안 된다 — 다음 충전까지 5분만 남아야 함)
  update public.profiles set owl_energy = 5, owl_energy_at = now() - interval '25 minutes' where id = c_uid;

  v_result := public.owl_energy_sync(c_uid);
  assert v_result = 7, format('25분 경과: 5+2=7 이어야 함 (실제 %s)', v_result);

  select * into v_row from public.profiles where id = c_uid;
  assert v_row.owl_energy = 7, format('저장된 owl_energy %s', v_row.owl_energy);
  assert extract(epoch from (now() - v_row.owl_energy_at)) between 295 and 305,
         format('owl_energy_at 은 20분(2×10분)만 전진해야 함 → 다음 충전까지 약 5분 (경과 %s초)',
                extract(epoch from (now() - v_row.owl_energy_at)));

  perform set_config('request.jwt.claim.sub', c_uid::text, true);
  v_status := public.owl_energy_status();
  assert (v_status ->> 'energy')::int = 7, format('status.energy %s', v_status);
  assert (v_status ->> 'next_refill_sec')::int between 295 and 305,
         format('next_refill_sec ≈ 300 이어야 함: %s', v_status);
  assert (v_status ->> 'full_in_sec')::int between 1495 and 1505,
         format('full_in_sec ≈ 300 + 2×600 = 1500 이어야 함: %s', v_status);

  -- 2.2 cap 이상이면 충전할 것이 없다 — 시계만 지금으로 리셋
  update public.profiles set owl_energy = 10, owl_energy_at = now() - interval '2 hours' where id = c_uid;
  v_result := public.owl_energy_sync(c_uid);
  assert v_result = 10, format('cap 이상이면 그대로 유지 (실제 %s)', v_result);
  select * into v_row from public.profiles where id = c_uid;
  assert extract(epoch from (now() - v_row.owl_energy_at)) < 5,
         format('cap 이상이면 시계가 now() 로 리셋돼야 함 (경과 %s초)',
                extract(epoch from (now() - v_row.owl_energy_at)));

  -- 2.3 회복이 cap 을 넘기면 cap 에서 멈추고, 그 순간 시계도 now() 로 리셋된다
  update public.profiles set owl_energy = 9, owl_energy_at = now() - interval '100 minutes' where id = c_uid;
  v_result := public.owl_energy_sync(c_uid);
  assert v_result = 10, format('9 + floor(100/10)=10 → least(10,19)=10 이어야 함 (실제 %s)', v_result);
  select * into v_row from public.profiles where id = c_uid;
  assert extract(epoch from (now() - v_row.owl_energy_at)) < 5,
         format('cap 도달 시 시계가 now() 로 리셋돼야 함 (경과 %s초)',
                extract(epoch from (now() - v_row.owl_energy_at)));

  v_status := public.owl_energy_status();
  assert (v_status ->> 'next_refill_sec')::int = 0, format('cap 이면 next_refill_sec=0: %s', v_status);
  assert (v_status ->> 'full_in_sec')::int = 0,     format('cap 이면 full_in_sec=0: %s', v_status);

  raise notice '✅ 2. owl_energy_sync 회복 계산 (진행분 보존 / cap 정지 / cap 도달 시 시계 리셋)';
end $$;


-- ===== 3. start_game_session 소모/거부 ================================
do $$
declare
  c_uid constant uuid := '0ee0e117-0000-4000-8000-000000000001';
  v_id  uuid;
  v_row public.profiles%rowtype;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  -- 3.1 cap(10) 상태에서 시작 → 1 소모. 소모 전 값이 cap 이상이었으므로 시계는 now() 로.
  update public.profiles set owl_energy = 10, owl_energy_at = now() - interval '3 minutes' where id = c_uid;
  v_id := public.start_game_session('typer');
  assert v_id is not null, '세션 id 가 반환돼야 함';
  select * into v_row from public.profiles where id = c_uid;
  assert v_row.owl_energy = 9, format('시작 후 에너지 9 (실제 %s)', v_row.owl_energy);
  assert extract(epoch from (now() - v_row.owl_energy_at)) < 5,
         format('pre-spend 가 cap 이상이면 시계가 now() 로 리셋돼야 함 (경과 %s초)',
                extract(epoch from (now() - v_row.owl_energy_at)));
  update public.game_sessions set status = 'expired' where id = v_id;

  -- 3.2 cap 미만 상태에서 시작 → 시계는 건드리지 않는다 (진행 중인 회복 게이지 유지)
  update public.profiles set owl_energy = 5, owl_energy_at = now() - interval '3 minutes' where id = c_uid;
  v_id := public.start_game_session('typer');
  select * into v_row from public.profiles where id = c_uid;
  assert v_row.owl_energy = 4, format('시작 후 에너지 4 (실제 %s)', v_row.owl_energy);
  assert extract(epoch from (now() - v_row.owl_energy_at)) between 175 and 185,
         format('cap 미만이면 시계를 건드리면 안 됨 (경과 %s초)',
                extract(epoch from (now() - v_row.owl_energy_at)));
  update public.game_sessions set status = 'expired' where id = v_id;

  -- 3.3 에너지 0 → 정확한 한국어 메시지로 거부, 에너지·세션 모두 변화 없음
  update public.profiles set owl_energy = 0, owl_energy_at = now() where id = c_uid;
  begin
    perform public.start_game_session('typer');
    assert false, '에너지 0 인데 시작이 성공함';
  exception when others then
    assert sqlerrm = '아울 에너지가 부족해요. 10분마다 1개씩 충전돼요',
           format('거부 메시지가 다름: %s', sqlerrm);
  end;
  select * into v_row from public.profiles where id = c_uid;
  assert v_row.owl_energy = 0, format('실패 시 에너지가 바뀌면 안 됨 (실제 %s)', v_row.owl_energy);
  assert not exists (select 1 from public.game_sessions where user_id = c_uid and status = 'active'),
         '실패했는데 active 세션이 생김';

  raise notice '✅ 3. start_game_session 소모(-1) / 부족 시 정확한 메시지로 거부';
end $$;


-- ===== 4. booth_grant_energy ==========================================
do $$
declare
  c_staff  constant uuid := '0ee0e117-0000-4000-8000-000000000002';
  c_uid    constant uuid := '0ee0e117-0000-4000-8000-000000000001';
  c_target constant uuid := '0ee0e117-0000-4000-8000-000000000004';
  v_r      jsonb;
  v_row    public.profiles%rowtype;
  v_grant  public.energy_grants%rowtype;
  v_keys   text[];
begin
  perform set_config('request.jwt.claim.sub', c_staff::text, true);

  -- 4.1 cap(10) 상태에서 +5 → regen cap 위로 올라간다(hard_cap 20 은 안 넘음)
  update public.profiles set owl_energy = 10, owl_energy_at = now() where id = c_target;
  v_r := public.booth_grant_energy('999300004', 5, '미션 클리어');
  assert (v_r ->> 'energy')::int = 15,  format('지급 후 15 (실제 %s)', v_r);
  assert (v_r ->> 'granted')::int = 5,  format('granted 는 5: %s', v_r);
  assert v_r ->> 'student_id' = '999300004', format('student_id 불일치: %s', v_r);
  assert v_r ->> 'user_id' = c_target::text, format('user_id 불일치: %s', v_r);

  select array_agg(k order by k) into v_keys from jsonb_object_keys(v_r) as k;
  assert v_keys = array['energy', 'granted', 'name', 'student_id', 'user_id'],
         format('booth_grant_energy 응답 키 구성이 다름: %s', v_r);

  select * into v_row from public.profiles where id = c_target;
  assert v_row.owl_energy = 15, format('프로필 owl_energy %s', v_row.owl_energy);

  select * into v_grant from public.energy_grants
   where user_id = c_target and reason = '미션 클리어'
   order by created_at desc limit 1;
  assert found, 'energy_grants 행이 생성되지 않음';
  assert v_grant.staff_id = c_staff, format('staff_id 불일치: %s', v_grant.staff_id);
  assert v_grant.amount = 5,         format('amount 불일치: %s', v_grant.amount);

  -- 4.2 18 상태에서 +5 → naive 로는 23 이지만 hard_cap(20) 에서 잘려야 한다.
  --     (10→15→20 처럼 딱 떨어지는 값만 쓰면 clamp 가 없어도 우연히 같은 결과가 나와
  --      회귀를 못 잡는다 — 그래서 일부러 경계를 넘기는 값으로 검증한다)
  update public.profiles set owl_energy = 18, owl_energy_at = now() where id = c_target;
  v_r := public.booth_grant_energy('999300004', 5, '미션2');
  assert (v_r ->> 'energy')::int = 20,  format('18+5 은 hard_cap(20) 에서 잘려야 함: %s', v_r);
  assert (v_r ->> 'granted')::int = 2,  format('granted 는 실제로 늘어난 2 여야 함(clamp 반영): %s', v_r);

  -- 4.3 hard_cap 에서 또 지급 시도 → 거부
  begin
    perform public.booth_grant_energy('999300004', 1, '미션3');
    assert false, 'hard_cap 인데 지급이 성공함';
  exception when others then
    assert sqlerrm = '이미 에너지가 가득 찼어요', format('메시지 불일치: %s', sqlerrm);
  end;

  -- 4.4 유효성 검사
  begin
    perform public.booth_grant_energy('999300004', 0, '사유');
    assert false, 'amount=0 인데 성공함';
  exception when others then
    assert sqlerrm = '지급 개수는 1~5개예요', format('메시지 불일치: %s', sqlerrm);
  end;

  begin
    perform public.booth_grant_energy('999300004', 6, '사유');
    assert false, 'amount=6 인데 성공함';
  exception when others then
    assert sqlerrm = '지급 개수는 1~5개예요', format('메시지 불일치: %s', sqlerrm);
  end;

  begin
    perform public.booth_grant_energy('999300004', 1, '   ');
    assert false, '빈 사유인데 성공함';
  exception when others then
    assert sqlerrm = '지급 사유를 적어주세요', format('메시지 불일치: %s', sqlerrm);
  end;

  begin
    perform public.booth_grant_energy('999300004', 1, repeat('가', 41));
    assert false, '41자 사유인데 성공함';
  exception when others then
    assert sqlerrm = '지급 사유를 적어주세요', format('메시지 불일치: %s', sqlerrm);
  end;

  begin
    perform public.booth_grant_energy('000000000', 1, '사유');
    assert false, '없는 학번인데 성공함';
  exception when others then
    assert sqlerrm = '학번을 찾을 수 없어요', format('메시지 불일치: %s', sqlerrm);
  end;

  -- 4.5 부원 권한 없는 유저가 시도 → 거부
  perform set_config('request.jwt.claim.sub', c_uid::text, true);
  begin
    perform public.booth_grant_energy('999300004', 1, '사유');
    assert false, '일반 유저인데 지급이 성공함';
  exception when others then
    assert sqlerrm = '부원 권한이 필요해요', format('메시지 불일치: %s', sqlerrm);
  end;

  raise notice '✅ 4. booth_grant_energy (regen cap 초과 지급 / hard_cap 정지 / 유효성 / 권한)';
end $$;


-- ===== 5. admin_set_energy ============================================
do $$
declare
  c_admin  constant uuid := '0ee0e117-0000-4000-8000-000000000003';
  c_staff  constant uuid := '0ee0e117-0000-4000-8000-000000000002';
  c_target constant uuid := '0ee0e117-0000-4000-8000-000000000004';
  v_row public.profiles%rowtype;
begin
  perform set_config('request.jwt.claim.sub', c_staff::text, true);
  begin
    perform public.admin_set_energy(c_target, 5);
    assert false, '스태프(관리자 아님)인데 admin_set_energy 성공함';
  exception when others then
    assert sqlerrm = '관리자 권한이 필요해요', format('메시지 불일치: %s', sqlerrm);
  end;

  perform set_config('request.jwt.claim.sub', c_admin::text, true);

  perform public.admin_set_energy(c_target, 999);
  select * into v_row from public.profiles where id = c_target;
  assert v_row.owl_energy = 20, format('999 → hard_cap(20) 으로 clamp (실제 %s)', v_row.owl_energy);
  assert extract(epoch from (now() - v_row.owl_energy_at)) < 5, '시계가 now() 로 리셋돼야 함';

  perform public.admin_set_energy(c_target, -5);
  select * into v_row from public.profiles where id = c_target;
  assert v_row.owl_energy = 0, format('-5 → 0 으로 clamp (실제 %s)', v_row.owl_energy);

  raise notice '✅ 5. admin_set_energy (관리자 전용 / 0..hard_cap clamp)';
end $$;


-- ===== 6. 아울러닝 인게임 드랍 — 개별 조건 ==============================
do $$
declare
  c_flight constant uuid := '0ee0e117-0000-4000-8000-000000000005';
  c_meta   constant jsonb := jsonb_build_object(
    'distance_m', 1000, 'duration_s', 90, 'pass_count', 50, 'near_miss', 10,
    'combo_mult_avg', 1.5, 'items', 5, 'item_score', 200, 'energy_left', 20,
    'phase_max', 3, 'special_cleared', 0, 'owl_energy_found', true
  );
  -- raw_server = 1000 + 50*10*1.5 + 10*25*1.5 + 200 + 0*200 + 20*2 = 2365 (오차 0 → 그대로 채택)
  c_raw    constant int := 2365;
  v_sid  uuid;
  v_r    jsonb;
  v_keys text[];
  v_cnt  int;
begin
  perform set_config('request.jwt.claim.sub', c_flight::text, true);
  update public.profiles set owl_energy = 5, owl_energy_at = now() where id = c_flight;

  -- 6.1 조건을 전부 만족 → +1 지급
  insert into public.game_sessions (user_id, game, started_at)
  values (c_flight, 'flight', now() - interval '90 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, c_raw, c_meta);
  assert v_r ->> 'status' = 'ok', format('정상 케이스인데 거부됨: %s', v_r);
  assert (v_r ->> 'owl_energy_gained')::int = 1, format('정상 조건인데 지급 안 됨: %s', v_r);
  assert (v_r ->> 'owl_energy')::int = 6,        format('지급 후 에너지 6 (실제 %s)', v_r ->> 'owl_energy');

  select array_agg(k order by k) into v_keys from jsonb_object_keys(v_r) as k;
  assert v_keys = array['level_after', 'level_before', 'owl_energy', 'owl_energy_gained', 'points',
                         'rank_after', 'rank_before', 'raw_score', 'status', 'tickets_gained', 'total_points',
                         'unlocked_stage'],
         format('ok 응답 키 구성이 다름: %s', v_r);

  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_flight and status = 'submitted';

  -- 6.2 owl_energy_found = false → 지급 안 함
  insert into public.game_sessions (user_id, game, started_at)
  values (c_flight, 'flight', now() - interval '90 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, c_raw, c_meta || '{"owl_energy_found":false}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('flag=false 케이스: %s', v_r);
  assert (v_r ->> 'owl_energy_gained')::int = 0, format('flag=false 인데 지급됨: %s', v_r);
  assert (v_r ->> 'owl_energy')::int = 6,        format('에너지가 그대로 6 이어야 함 (실제 %s)', v_r ->> 'owl_energy');
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_flight and status = 'submitted';

  -- 6.3 phase_max 미달 (2 < 3) → 지급 안 함
  insert into public.game_sessions (user_id, game, started_at)
  values (c_flight, 'flight', now() - interval '90 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, c_raw, c_meta || '{"phase_max":2}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('phase_max 미달 케이스: %s', v_r);
  assert (v_r ->> 'owl_energy_gained')::int = 0, format('phase_max 미달인데 지급됨: %s', v_r);
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_flight and status = 'submitted';

  -- 6.4 distance_m 미달 (500 < 900) → 지급 안 함
  insert into public.game_sessions (user_id, game, started_at)
  values (c_flight, 'flight', now() - interval '90 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, c_raw, c_meta || '{"distance_m":500}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('distance_m 미달 케이스: %s', v_r);
  assert (v_r ->> 'owl_energy_gained')::int = 0, format('distance_m 미달인데 지급됨: %s', v_r);
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_flight and status = 'submitted';

  -- 6.5 거부된 제출은 조건을 다 만족해도 지급되지 않는다 (플레이 시간 3초 미만 → 거부)
  insert into public.game_sessions (user_id, game, started_at)
  values (c_flight, 'flight', now())
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, c_raw,
    c_meta || '{"owl_energy_found":true,"phase_max":99,"distance_m":99999}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('거부돼야 하는데: %s', v_r);
  assert (v_r ->> 'owl_energy_gained')::int = 0, format('거부됐는데 지급됨: %s', v_r);
  assert (v_r ->> 'owl_energy')::int = 6,
         format('거부돼도 owl_energy 키는 현재 값을 보여줘야 함 (실제 %s)', v_r ->> 'owl_energy');

  select array_agg(k order by k) into v_keys from jsonb_object_keys(v_r) as k;
  assert v_keys = array['level_after', 'level_before', 'owl_energy', 'owl_energy_gained', 'points',
                         'rank_after', 'rank_before', 'raw_score', 'reason', 'status', 'tickets_gained',
                         'total_points', 'unlocked_stage'],
         format('rejected 응답 키 구성이 다름: %s', v_r);

  -- 6.6 non-flight(typer) 는 조건을 다 만족해도 지급되지 않는다
  insert into public.game_sessions (user_id, game, started_at)
  values (c_flight, 'typer', now() - interval '40 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 1000,
    jsonb_build_object('owl_energy_found', true, 'phase_max', 99, 'distance_m', 99999));
  assert v_r ->> 'status' = 'ok', format('typer 케이스: %s', v_r);
  assert (v_r ->> 'owl_energy_gained')::int = 0, format('typer 인데 지급됨: %s', v_r);
  assert (v_r ->> 'owl_energy')::int = 6, format('typer 제출 후에도 에너지는 그대로 6 (실제 %s)', v_r ->> 'owl_energy');

  select count(*) into v_cnt from public.energy_grants
   where user_id = c_flight and staff_id is null and reason = 'game_drop';
  assert v_cnt = 1, format('game_drop 지급은 딱 1건이어야 함 (실제 %s)', v_cnt);

  raise notice '✅ 6. 인게임 드랍 개별 조건 (flag / phase_max / distance_m / 거부 / non-flight 무영향)';
end $$;


-- ===== 7. 아울러닝 인게임 드랍 — 일일 상한 ==============================
do $$
declare
  c_daily constant uuid := '0ee0e117-0000-4000-8000-000000000006';
  c_meta  constant jsonb := jsonb_build_object(
    'distance_m', 1000, 'duration_s', 90, 'pass_count', 50, 'near_miss', 10,
    'combo_mult_avg', 1.5, 'items', 5, 'item_score', 200, 'energy_left', 20,
    'phase_max', 3, 'special_cleared', 0, 'owl_energy_found', true
  );
  c_raw   constant int := 2365;
  v_sid   uuid;
  v_r     jsonb;
  v_expect int;
  v_cnt    int;
begin
  perform set_config('request.jwt.claim.sub', c_daily::text, true);
  update public.profiles set owl_energy = 5, owl_energy_at = now() where id = c_daily;
  v_expect := 5;

  for i in 1..6 loop
    insert into public.game_sessions (user_id, game, started_at)
    values (c_daily, 'flight', now() - interval '90 seconds')
    returning id into v_sid;

    v_r := public.submit_game_session(v_sid, c_raw, c_meta);
    assert v_r ->> 'status' = 'ok', format('[%s회차] ok 여야 함: %s', i, v_r);

    if i <= 5 then
      v_expect := v_expect + 1;
      assert (v_r ->> 'owl_energy_gained')::int = 1,
             format('[%s회차] 5회까지는 드랍이 지급돼야 함: %s', i, v_r);
    else
      assert (v_r ->> 'owl_energy_gained')::int = 0,
             format('[%s회차] 일일 상한(5) 초과 후엔 지급되면 안 됨: %s', i, v_r);
    end if;

    assert (v_r ->> 'owl_energy')::int = v_expect,
           format('[%s회차] 에너지 %s 여야 함 (실제 %s)', i, v_expect, v_r ->> 'owl_energy');

    update public.game_sessions set submitted_at = now() - interval '1 hour'
     where user_id = c_daily and status = 'submitted';
  end loop;

  select count(*) into v_cnt from public.energy_grants
   where user_id = c_daily and staff_id is null and reason = 'game_drop';
  assert v_cnt = 5, format('game_drop 행은 5개여야 함 (실제 %s)', v_cnt);

  raise notice '✅ 7. 인게임 드랍 일일 상한(5) — 6번째부터 차단';
end $$;

do $$
begin
  raise notice '🎉 owl_energy: 회복 계산 / 소모·거부 / 부스 지급 / 관리자 보정 / 인게임 드랍(조건·거부·일일상한) 모두 통과';
end $$;

rollback;
