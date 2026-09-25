-- =====================================================================
-- OWL GAMES — 타이퍼·피싱 서버 검증 + 운영(관리자) 시스템 검증
--   대상: 20260927000000_typer_phish_validation.sql
--         20260927000100_admin_system.sql
--
--   실행: psql "<connection-string>" -f supabase/tests/admin_system.sql
--         또는 Supabase SQL 편집기에 전체 붙여넣기
--   결과: 오류 없이 끝나면 통과 (섹션마다 NOTICE 로 요약 출력)
--
--   주의
--   · 전부 트랜잭션 안에서 돌고 마지막에 rollback 한다. 영구 변경 없음.
--   · auth.uid() 는 request.jwt.claim.sub 를 set_config(..., true) 로 흉내낸다.
--   · 같은 유저가 연속 제출할 때는 직전 submitted_at 을 1시간 전으로 되돌려
--     레이트리밋(제출 간격 < min_sec)을 피한다 (new_games.sql 과 같은 방식).
-- =====================================================================

begin;
set local plpgsql.check_asserts = on;

-- ===== 0. 테스트 유저 ================================================
do $$
declare
  c_t_ok      constant uuid := '0aa1ad11-0000-4000-8000-000000000001';
  c_t_fire    constant uuid := '0aa1ad11-0000-4000-8000-000000000002';
  c_t_fast    constant uuid := '0aa1ad11-0000-4000-8000-000000000003';
  c_t_inflate constant uuid := '0aa1ad11-0000-4000-8000-000000000004';
  c_p_ok      constant uuid := '0aa1ad11-0000-4000-8000-000000000005';
  c_p_wrong   constant uuid := '0aa1ad11-0000-4000-8000-000000000006';
  c_p_inflate constant uuid := '0aa1ad11-0000-4000-8000-000000000007';
  c_admin     constant uuid := '0aa1ad11-0000-4000-8000-000000000008';
  c_member    constant uuid := '0aa1ad11-0000-4000-8000-000000000009';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (c_t_ok,      '999500001@owlgames.local', jsonb_build_object('name', '타이퍼정상',   'student_id', '999500001')),
    (c_t_fire,    '999500002@owlgames.local', jsonb_build_object('name', '방화벽조작',   'student_id', '999500002')),
    (c_t_fast,    '999500003@owlgames.local', jsonb_build_object('name', '타이퍼속도',   'student_id', '999500003')),
    (c_t_inflate, '999500004@owlgames.local', jsonb_build_object('name', '타이퍼뻥튀기', 'student_id', '999500004')),
    (c_p_ok,      '999500005@owlgames.local', jsonb_build_object('name', '피싱정상',     'student_id', '999500005')),
    (c_p_wrong,   '999500006@owlgames.local', jsonb_build_object('name', '피싱오답',     'student_id', '999500006')),
    (c_p_inflate, '999500007@owlgames.local', jsonb_build_object('name', '피싱뻥튀기',   'student_id', '999500007')),
    (c_admin,     '999500008@owlgames.local', jsonb_build_object('name', '관리자',       'student_id', '999500008')),
    (c_member,    '999500009@owlgames.local', jsonb_build_object('name', '일반부원',     'student_id', '999500009'));

  update public.profiles set verified = true
   where id in (c_t_ok, c_t_fire, c_t_fast, c_t_inflate, c_p_ok, c_p_wrong, c_p_inflate, c_admin, c_member);
  update public.profiles set role = 'admin' where id = c_admin;

  raise notice '테스트 유저 9명 준비 완료';
end $$;


-- ===== 1. 피싱 최대 점수 공식 ========================================
do $$
begin
  -- 연속 1장 = 100, 2장 = 100 + 110 = 210, 11장 = 1650 (배율이 2.0 에서 멈춘다)
  assert public.phish_streak_score(0)  = 0,    format('f(0)=%s',  public.phish_streak_score(0));
  assert public.phish_streak_score(1)  = 100,  format('f(1)=%s',  public.phish_streak_score(1));
  assert public.phish_streak_score(2)  = 210,  format('f(2)=%s',  public.phish_streak_score(2));
  assert public.phish_streak_score(11) = 1650, format('f(11)=%s', public.phish_streak_score(11));
  assert public.phish_streak_score(12) = 1850, format('f(12)=%s', public.phish_streak_score(12));

  -- 정답 10장을 최고 연속 5로 쪼개면 f(5) 두 번
  assert public.phish_max_score(10, 5) = 2 * public.phish_streak_score(5),
         format('max(10,5)=%s', public.phish_max_score(10, 5));
  -- 연속이 길수록 총점이 크다
  assert public.phish_max_score(10, 10) > public.phish_max_score(10, 5), '연속이 길면 총점이 커야 한다';
  -- 최고 연속이 정답 수보다 크면 전부 한 줄로 본다
  assert public.phish_max_score(7, 99) = public.phish_streak_score(7), '연속 > 정답이면 한 줄';
  assert public.phish_max_score(0, 0) = 0, '정답 0이면 0';

  raise notice '✅ 1. 피싱 최대 점수 공식 (연속 보너스 2.0 상한 포함)';
end $$;


-- ===== 2. 타이퍼 정상 제출 ===========================================
do $$
declare
  c_uid constant uuid := '0aa1ad11-0000-4000-8000-000000000001';
  -- 40초 동안 24개 파괴 / 2개 놓침 → 방화벽 40%
  c_meta constant jsonb := '{"hits":24,"misses":2,"max_combo":11,"firewall":40,"duration_sec":40,"stage_max":11}'::jsonb;
  v_sid uuid;
  v_r   jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'typer', now() - interval '41 seconds')
  returning id into v_sid;

  -- 24개 × 평균 8글자 × 콤보 ≈ 3,000점 (상한 24 × 440 = 10,560 아래)
  v_r := public.submit_game_session(v_sid, 3000, c_meta);

  assert v_r ->> 'status' = 'ok', format('정상 타이퍼 제출인데 %s', v_r);
  assert (v_r ->> 'raw_score')::int = 3000, format('raw_score 유지 안 됨: %s', v_r ->> 'raw_score');
  -- K=4 → 30 + min(270, 750) = 300 (상한)
  assert (v_r ->> 'points')::int = 300, format('points 상한 300 (실제 %s)', v_r ->> 'points');
  assert (select meta -> 'raw_adjusted' from public.game_sessions where id = v_sid) is null,
         '정상 제출인데 raw_adjusted 가 붙었다';

  raise notice '✅ 2. 타이퍼 정상 제출 통과 (방화벽 = 놓친 수 × 20%%)';
end $$;


-- ===== 3. 타이퍼 거부 규칙 ===========================================
do $$
declare
  c_fire constant uuid := '0aa1ad11-0000-4000-8000-000000000002';
  c_fast constant uuid := '0aa1ad11-0000-4000-8000-000000000003';
  v_sid  uuid;
  v_r    jsonb;
begin
  -- 3.1 방화벽 수치가 놓친 수와 안 맞으면 거부 (놓침 2 → 40 이어야 하는데 0 이라고 주장)
  perform set_config('request.jwt.claim.sub', c_fire::text, true);
  insert into public.game_sessions (user_id, game, started_at)
  values (c_fire, 'typer', now() - interval '40 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 2000,
           '{"hits":20,"misses":2,"max_combo":10,"firewall":0,"duration_sec":39}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('방화벽 조작인데 %s', v_r);
  assert v_r ->> 'reason' like '방화벽%', format('사유가 다름: %s', v_r ->> 'reason');
  assert (v_r ->> 'points')::int = 0, '거부인데 포인트가 붙었다';

  -- 3.2 스폰 가능 수보다 많은 단어 → 거부 (20초에 60개는 불가능: 20/0.6 + 2 = 35.3)
  perform set_config('request.jwt.claim.sub', c_fast::text, true);
  insert into public.game_sessions (user_id, game, started_at)
  values (c_fast, 'typer', now() - interval '20 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 5000,
           '{"hits":60,"misses":0,"max_combo":60,"firewall":0,"duration_sec":19}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('단어 수 조작인데 %s', v_r);
  assert v_r ->> 'reason' like '단어 수%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 3.3 콤보가 파괴 수보다 많으면 거부
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_fast and status = 'submitted';
  insert into public.game_sessions (user_id, game, started_at)
  values (c_fast, 'typer', now() - interval '30 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 1000,
           '{"hits":10,"misses":0,"max_combo":40,"firewall":0,"duration_sec":29}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('콤보 조작인데 %s', v_r);
  assert v_r ->> 'reason' like '콤보%', format('사유가 다름: %s', v_r ->> 'reason');

  raise notice '✅ 3. 타이퍼 거부 규칙 3종 (방화벽 / 단어 수 / 콤보)';
end $$;


-- ===== 4. 타이퍼 원점수 상한 =========================================
do $$
declare
  c_uid constant uuid := '0aa1ad11-0000-4000-8000-000000000004';
  v_sid uuid;
  v_r   jsonb;
  v_m   jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'typer', now() - interval '40 seconds')
  returning id into v_sid;

  -- 10개 파괴 → 상한 10 × 440 = 4,400. 99,999 를 주장하면 4,400 으로 깎인다
  v_r := public.submit_game_session(v_sid, 99999,
           '{"hits":10,"misses":1,"max_combo":10,"firewall":20,"duration_sec":39}'::jsonb);

  assert v_r ->> 'status' = 'ok', format('상한 클램프는 거부가 아니다: %s', v_r);
  assert (v_r ->> 'raw_score')::int = 4400, format('상한 4400 (실제 %s)', v_r ->> 'raw_score');

  select meta into v_m from public.game_sessions where id = v_sid;
  assert (v_m -> 'raw_adjusted') = to_jsonb(true), format('raw_adjusted 없음: %s', v_m);
  assert (v_m ->> 'raw_client')::int = 99999, format('raw_client 기록 안 됨: %s', v_m);

  raise notice '✅ 4. 타이퍼 원점수 상한 (파괴 수 × 440) + raw_adjusted 기록';
end $$;


-- ===== 5. 피싱 정상 / 거부 / 상한 ====================================
do $$
declare
  c_ok      constant uuid := '0aa1ad11-0000-4000-8000-000000000005';
  c_wrong   constant uuid := '0aa1ad11-0000-4000-8000-000000000006';
  c_inflate constant uuid := '0aa1ad11-0000-4000-8000-000000000007';
  v_sid uuid;
  v_r   jsonb;
  v_cap numeric;
begin
  -- 5.1 정상: 오답 2회 → 90 - 10 = 80초쯤에 끝난다
  perform set_config('request.jwt.claim.sub', c_ok::text, true);
  insert into public.game_sessions (user_id, game, started_at)
  values (c_ok, 'phish', now() - interval '82 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 3000,
           '{"answered":28,"correct":26,"wrong":2,"max_streak":15,"duration_s":80,"stage_max":10}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('정상 피싱 제출인데 %s', v_r);
  assert (v_r ->> 'raw_score')::int = 3000, format('raw_score 유지 안 됨: %s', v_r ->> 'raw_score');

  -- 5.2 오답 수와 경과시간이 안 맞으면 거부
  --     오답 10회면 90 - 50 = 40초에 끝나야 하는데 88초를 플레이했다고 주장
  perform set_config('request.jwt.claim.sub', c_wrong::text, true);
  insert into public.game_sessions (user_id, game, started_at)
  values (c_wrong, 'phish', now() - interval '88 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 2000,
           '{"answered":30,"correct":20,"wrong":10,"max_streak":10,"duration_s":86}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('오답/시간 불일치인데 %s', v_r);
  assert v_r ->> 'reason' like '오답 횟수%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 5.3 판별 수 합이 안 맞으면 거부
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_wrong and status = 'submitted';
  insert into public.game_sessions (user_id, game, started_at)
  values (c_wrong, 'phish', now() - interval '60 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 1000,
           '{"answered":30,"correct":20,"wrong":3,"max_streak":10,"duration_s":58}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('판별 수 불일치인데 %s', v_r);
  assert v_r ->> 'reason' like '판별 수%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 5.4 상한: 정답 20 · 최고 연속 5 로 만들 수 있는 최대를 넘으면 깎인다
  v_cap := public.phish_max_score(20, 5);
  perform set_config('request.jwt.claim.sub', c_inflate::text, true);
  insert into public.game_sessions (user_id, game, started_at)
  values (c_inflate, 'phish', now() - interval '85 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 50000,
           '{"answered":21,"correct":20,"wrong":1,"max_streak":5,"duration_s":83}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('상한 클램프는 거부가 아니다: %s', v_r);
  assert (v_r ->> 'raw_score')::int = round(v_cap)::int,
         format('상한 %s (실제 %s)', round(v_cap), v_r ->> 'raw_score');

  raise notice '✅ 5. 피싱 정상 / 거부 2종 / 원점수 상한';
end $$;


-- ===== 6. 마스터 관리자 부트스트랩 ===================================
do $$
declare
  c_master constant uuid := '0aa1ad11-0000-4000-8000-000000000021';
  c_second constant uuid := '0aa1ad11-0000-4000-8000-000000000022';
  v_cfg jsonb;
  v_p   public.profiles%rowtype;
begin
  v_cfg := public.cfg('master_admin');
  assert v_cfg is not null, 'master_admin 설정이 없다';
  assert jsonb_typeof(v_cfg -> 'student_ids') = 'array', format('student_ids 가 배열이 아님: %s', v_cfg);

  -- 지금은 위 섹션에서 만든 관리자가 이미 있으므로(bootstrap_only) 승격되지 않는다
  insert into auth.users (id, email, raw_user_meta_data)
  values (c_second, '999999999@owlgames.local',
          jsonb_build_object('name', '늦은마스터', 'student_id', '999999999'));
  select * into v_p from public.profiles where id = c_second;
  assert v_p.role = 'user', format('관리자가 이미 있는데 승격됐다: %s', v_p.role);

  -- 관리자를 모두 내리면(= 첫 설치 상태) 같은 학번이 마스터로 승격된다
  update public.profiles set role = 'user' where role = 'admin';
  delete from public.profiles where id = c_second;
  delete from auth.users where id = c_second;

  insert into auth.users (id, email, raw_user_meta_data)
  values (c_master, '999999999@owlgames.local',
          jsonb_build_object('name', '첫마스터', 'student_id', '999999999'));
  select * into v_p from public.profiles where id = c_master;
  assert v_p.role = 'admin', format('첫 관리자로 승격되지 않았다: %s', v_p.role);
  assert v_p.verified, '마스터는 인증 완료 상태여야 한다';

  -- 승격 사실이 감사 로그에 남는다
  assert exists (select 1 from public.admin_audit
                  where action = 'user.role' and target_id = c_master
                    and detail ->> 'to' = 'admin'),
         '마스터 승격이 감사 로그에 없다';

  -- 원상 복구 (뒤 섹션이 관리자 권한을 쓴다)
  delete from public.profiles where id = c_master;
  delete from auth.users where id = c_master;
  update public.profiles set role = 'admin' where id = '0aa1ad11-0000-4000-8000-000000000008';

  raise notice '✅ 6. 마스터 관리자 부트스트랩 (관리자가 없을 때만 승격)';
end $$;


-- ===== 7. 감사 로그 ==================================================
do $$
declare
  c_admin  constant uuid := '0aa1ad11-0000-4000-8000-000000000008';
  c_member constant uuid := '0aa1ad11-0000-4000-8000-000000000009';
  v_before int;
  v_after  int;
begin
  perform set_config('request.jwt.claim.sub', c_admin::text, true);

  -- 7.1 역할 변경이 남는다
  select count(*) into v_before from public.admin_audit where action = 'user.role';
  perform public.admin_set_role(c_member, 'staff');
  select count(*) into v_after from public.admin_audit where action = 'user.role';
  assert v_after = v_before + 1, format('역할 변경 기록 안 남음 (%s → %s)', v_before, v_after);
  assert exists (select 1 from public.admin_audit
                  where action = 'user.role' and target_id = c_member
                    and actor_id = c_admin and detail ->> 'to' = 'staff'),
         '역할 변경 기록 내용이 다르다';

  -- 7.2 에너지 지급이 남는다
  select count(*) into v_before from public.admin_audit where action = 'user.energy';
  perform public.admin_set_energy(c_member, 7);
  select count(*) into v_after from public.admin_audit where action = 'user.energy';
  assert v_after = v_before + 1, '에너지 변경 기록 안 남음';

  -- 7.3 재고 변경이 남는다
  select count(*) into v_before from public.admin_audit where action = 'prize.stock';
  perform public.admin_set_stock(1, 3);
  select count(*) into v_after from public.admin_audit where action = 'prize.stock';
  assert v_after = v_before + 1, '재고 변경 기록 안 남음';

  -- 7.4 본인이 자기 행을 바꾸는 건(게임 제출) 남지 않는다
  select count(*) into v_before from public.admin_audit;
  perform set_config('request.jwt.claim.sub', c_member::text, true);
  update public.profiles set total_points = total_points + 10, owl_energy = owl_energy - 1
   where id = c_member;
  select count(*) into v_after from public.admin_audit;
  assert v_after = v_before, format('본인 변경이 감사 로그에 남았다 (%s → %s)', v_before, v_after);

  raise notice '✅ 7. 감사 로그 (역할·에너지·재고는 남고, 본인 플레이는 안 남는다)';
end $$;


-- ===== 8. 운영 설정 변경 RPC =========================================
do $$
declare
  c_admin  constant uuid := '0aa1ad11-0000-4000-8000-000000000008';
  c_member constant uuid := '0aa1ad11-0000-4000-8000-000000000009';
  v_r   jsonb;
  v_err text;
begin
  perform set_config('request.jwt.claim.sub', c_admin::text, true);

  -- 8.1 정상 변경
  v_r := public.admin_set_config('open_hours',
          '{"start":"09:30","end":"18:30","tz":"Asia/Seoul"}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('설정 변경 실패: %s', v_r);
  assert public.cfg('open_hours') ->> 'start' = '09:30', '설정이 반영되지 않았다';
  assert exists (select 1 from public.admin_audit where action = 'config.set'
                   and detail ->> 'key' = 'open_hours'),
         '설정 변경이 감사 로그에 없다';

  -- 8.2 화이트리스트 밖 키는 거부
  begin
    perform public.admin_set_config('gacha_table', '{"x":1}'::jsonb);
    assert false, '화이트리스트 밖 키가 통과했다';
  exception when sqlstate 'P0001' then null;
  end;

  -- 8.3 잘못된 값은 거부 (K값 0)
  begin
    perform public.admin_set_config('game_k',
      '{"typer":0,"flight":20,"phish":10,"logic":20,"survive":30}'::jsonb);
    assert false, 'K값 0 이 통과했다';
  exception when sqlstate 'P0001' then null;
  end;

  -- 8.4 게임 키가 빠지면 거부 (그 게임 제출이 통째로 실패하므로)
  begin
    perform public.admin_set_config('game_k', '{"typer":4,"flight":20}'::jsonb);
    assert false, 'K값 일부 누락이 통과했다';
  exception when sqlstate 'P0001' then null;
  end;

  -- 8.5 마스터 관리자 학번 형식 검사
  begin
    perform public.admin_set_config('master_admin', '{"student_ids":["abc"]}'::jsonb);
    assert false, '잘못된 학번이 통과했다';
  exception when sqlstate 'P0001' then null;
  end;
  v_r := public.admin_set_config('master_admin',
          '{"student_ids":["202612345"],"bootstrap_only":true}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('마스터 학번 변경 실패: %s', v_r);

  -- 8.6 아울 에너지: 보관 상한 < 자동 충전 상한이면 거부
  begin
    perform public.admin_set_config('owl_energy', '{"hard_cap":5}'::jsonb);
    assert false, 'hard_cap < cap 이 통과했다';
  exception when sqlstate 'P0001' then null;
  end;

  -- 8.7 아울 에너지: 일부 키만 보내면 나머지는 유지된다 (드롭 조건이 날아가면 안 된다)
  v_r := public.admin_set_config('owl_energy', '{"regen_min":7}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('에너지 설정 변경 실패: %s', v_r);
  assert (public.cfg('owl_energy') ->> 'regen_min')::int = 7, '충전 간격이 반영되지 않았다';
  assert (public.cfg('owl_energy') ->> 'drop_min_distance')::int = 900,
         format('기존 드롭 조건이 사라졌다: %s', public.cfg('owl_energy'));

  -- 8.8 관리자가 아니면 거부
  perform set_config('request.jwt.claim.sub', c_member::text, true);
  begin
    perform public.admin_set_config('open_hours',
      '{"start":"00:00","end":"23:59","tz":"Asia/Seoul"}'::jsonb);
    assert false, '관리자가 아닌데 설정이 바뀌었다';
  exception when sqlstate 'P0001' then null;
  end;

  raise notice '✅ 8. admin_set_config (화이트리스트 · 값 검증 · 권한)';
end $$;


-- ===== 9. 대시보드 집계 ==============================================
do $$
declare
  c_admin  constant uuid := '0aa1ad11-0000-4000-8000-000000000008';
  c_member constant uuid := '0aa1ad11-0000-4000-8000-000000000009';
  v_s jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_admin::text, true);
  v_s := public.admin_stats();

  assert (v_s -> 'users' ->> 'total')::int >= 9, format('유저 수가 이상하다: %s', v_s -> 'users');
  assert (v_s -> 'users' ->> 'admin')::int >= 1, '관리자 수가 0이다';
  assert jsonb_typeof(v_s -> 'games') = 'array', 'games 가 배열이 아니다';
  assert (v_s -> 'today' ->> 'plays')::int >= 1, format('오늘 플레이가 0이다: %s', v_s -> 'today');
  assert (v_s -> 'today' ->> 'rejected')::int >= 1, '오늘 거부가 0이다';
  assert jsonb_typeof(v_s -> 'prizes') = 'array', 'prizes 가 배열이 아니다';
  assert (v_s -> 'tickets') is not null, 'tickets 집계가 없다';
  assert (v_s ->> 'generated_at') is not null, 'generated_at 이 없다';

  -- 게임별 집계에 typer 가 있고, 거부 건수가 잡힌다
  assert exists (
    select 1 from jsonb_array_elements(v_s -> 'games') g
     where g ->> 'game' = 'typer' and (g ->> 'plays')::int >= 1
  ), format('게임별 집계에 typer 가 없다: %s', v_s -> 'games');

  -- 관리자가 아니면 거부
  perform set_config('request.jwt.claim.sub', c_member::text, true);
  begin
    perform public.admin_stats();
    assert false, '관리자가 아닌데 통계가 나왔다';
  exception when sqlstate 'P0001' then null;
  end;

  raise notice '✅ 9. admin_stats (유저·오늘·게임별·티켓·상품)';
end $$;


-- ===== 10. 권한 =====================================================
do $$
begin
  assert has_function_privilege('authenticated', 'public.admin_set_config(text,jsonb)', 'execute'),
         'authenticated 가 admin_set_config 를 못 부른다';
  assert not has_function_privilege('anon', 'public.admin_set_config(text,jsonb)', 'execute'),
         'anon 이 admin_set_config 를 부를 수 있다';
  assert has_function_privilege('authenticated', 'public.admin_stats()', 'execute'),
         'authenticated 가 admin_stats 를 못 부른다';
  assert not has_function_privilege('anon', 'public.admin_stats()', 'execute'),
         'anon 이 admin_stats 를 부를 수 있다';
  assert not has_function_privilege('authenticated', 'public.audit_write(text,uuid,text,jsonb)', 'execute'),
         'audit_write 는 아무도 직접 못 불러야 한다';

  raise notice '✅ 10. 실행 권한 (anon 차단 · audit_write 비공개)';
end $$;

rollback;
