-- =====================================================================
-- OWL GAMES — 신규 게임 2종 (아울 로직 / 아울 서바이버즈) 검증
--   대상: 20260926000000_new_games.sql 의 submit_game_session
--   명세: OWLLOGIC_GDD.md §7, OWLSURVIVORS_GDD.md §8~§10
--
--   실행: psql "<connection-string>" -f supabase/tests/new_games.sql
--         또는 Supabase SQL 편집기에 전체 붙여넣기
--   결과: 오류 없이 끝나면 통과 (섹션마다 NOTICE 로 요약 출력)
--
--   주의
--   · 전부 트랜잭션 안에서 돌고 마지막에 rollback 한다. 영구 변경 없음.
--     (테스트 유저 10명을 auth.users 에 잠깐 만들었다가 되돌린다)
--   · auth.uid() 를 흉내내려고 request.jwt.claim.sub 를 set_config(..., true) 로 잡는다.
--   · start_game_session() 을 거치지 않고 game_sessions 에 직접 세션을 만든다
--     (검증 대상이 submit 이고, 아울 에너지 소모/운영시간 검사는 이전 마이그레이션에서
--     이미 검증됐다 — flight_validation.sql / owl_energy.sql 과 동일한 접근).
--   · 같은 유저가 연속 제출하는 케이스는 레이트리밋(제출 간격 < min_sec)을 피하려고
--     직전 submitted_at 을 1시간 전으로 되돌린다. rejected 로 끝난 제출은 레이트리밋에
--     영향을 주지 않으므로(마지막 '제출된' 시각만 본다) 따로 되돌릴 필요가 없다.
-- =====================================================================

begin;
set local plpgsql.check_asserts = on;

-- ===== 0. 테스트 유저 준비 ============================================
do $$
declare
  c_logic_ok      constant uuid := '0aa1a117-0000-4000-8000-000000000001';
  c_logic_reject  constant uuid := '0aa1a117-0000-4000-8000-000000000002';
  c_logic_inflate constant uuid := '0aa1a117-0000-4000-8000-000000000003';
  c_sv_ok         constant uuid := '0aa1a117-0000-4000-8000-000000000004';
  c_sv_reject     constant uuid := '0aa1a117-0000-4000-8000-000000000005';
  c_sv_unlock     constant uuid := '0aa1a117-0000-4000-8000-000000000006';
  c_sv_stagemult  constant uuid := '0aa1a117-0000-4000-8000-000000000007';
  c_energy_logic  constant uuid := '0aa1a117-0000-4000-8000-000000000008';
  c_energy_sv     constant uuid := '0aa1a117-0000-4000-8000-000000000009';
  c_other         constant uuid := '0aa1a117-0000-4000-8000-000000000010';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (c_logic_ok,      '999400001@owlgames.local', jsonb_build_object('name', '로직정상', 'student_id', '999400001')),
    (c_logic_reject,  '999400002@owlgames.local', jsonb_build_object('name', '로직거부', 'student_id', '999400002')),
    (c_logic_inflate, '999400003@owlgames.local', jsonb_build_object('name', '로직뻥튀기', 'student_id', '999400003')),
    (c_sv_ok,         '999400004@owlgames.local', jsonb_build_object('name', '서바정상', 'student_id', '999400004')),
    (c_sv_reject,     '999400005@owlgames.local', jsonb_build_object('name', '서바거부', 'student_id', '999400005')),
    (c_sv_unlock,     '999400006@owlgames.local', jsonb_build_object('name', '서바해금', 'student_id', '999400006')),
    (c_sv_stagemult,  '999400007@owlgames.local', jsonb_build_object('name', '서바배율', 'student_id', '999400007')),
    (c_energy_logic,  '999400008@owlgames.local', jsonb_build_object('name', '로직드랍', 'student_id', '999400008')),
    (c_energy_sv,     '999400009@owlgames.local', jsonb_build_object('name', '서바드랍', 'student_id', '999400009')),
    (c_other,         '999400010@owlgames.local', jsonb_build_object('name', '무관게임', 'student_id', '999400010'));

  update public.profiles set verified = true
   where id in (c_logic_ok, c_logic_reject, c_logic_inflate, c_sv_ok, c_sv_reject,
                c_sv_unlock, c_sv_stagemult, c_energy_logic, c_energy_sv, c_other);

  raise notice '테스트 유저 10명 준비 완료';
end $$;


-- ===== 1. 설정 / 스키마 확인 ==========================================
do $$
declare
  v_k    jsonb := public.cfg('game_k');
  v_lim  jsonb := public.cfg('game_limits');
  v_sst  jsonb := public.cfg('survive_stages');
begin
  assert (v_k ->> 'logic')::numeric = 20,   format('game_k.logic 는 20: %s', v_k);
  assert (v_k ->> 'survive')::numeric = 30, format('game_k.survive 는 30: %s', v_k);
  assert (v_k ->> 'typer')::numeric = 4,    'typer K 가 바뀌면 안 됨';
  assert (v_k ->> 'flight')::numeric = 20,  'flight K 가 바뀌면 안 됨';
  assert (v_k ->> 'phish')::numeric = 10,   'phish K 가 바뀌면 안 됨';

  assert (v_lim -> 'logic' ->> 'min_sec')::numeric = 10,   format('logic min_sec: %s', v_lim);
  assert (v_lim -> 'logic' ->> 'max_sec')::numeric = 185,  format('logic max_sec: %s', v_lim);
  assert (v_lim -> 'survive' ->> 'min_sec')::numeric = 15, format('survive min_sec: %s', v_lim);
  assert (v_lim -> 'survive' ->> 'max_sec')::numeric = 200,format('survive max_sec: %s', v_lim);
  assert (v_lim -> 'typer' ->> 'max_sec')::numeric = 65,   'typer 제한이 바뀌면 안 됨';
  assert (v_lim -> 'flight' ->> 'max_sec')::numeric = 185, 'flight 제한이 바뀌면 안 됨';
  assert (v_lim -> 'phish' ->> 'max_sec')::numeric = 95,   'phish 제한이 바뀌면 안 됨';

  assert (v_sst ->> 'unlock_default')::int = 1, format('survive_stages.unlock_default: %s', v_sst);
  assert (v_sst ->> 'max')::int = 3,             format('survive_stages.max: %s', v_sst);
  assert v_sst -> 'mult' = '[1.0,1.25,1.5]'::jsonb, format('survive_stages.mult: %s', v_sst);

  assert exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'game_id' and e.enumlabel = 'logic'
  ), 'game_id enum 에 logic 이 없음';
  assert exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'game_id' and e.enumlabel = 'survive'
  ), 'game_id enum 에 survive 가 없음';

  assert exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'meta'
  ), 'profiles.meta 컬럼이 없음';

  raise notice '✅ 1. 설정(game_k/game_limits/survive_stages) / enum / 스키마 확인';
end $$;


-- ===== 2. 아울 로직 — 정상 제출 (GDD §7.3 예시 메타) ===================
do $$
declare
  c_uid  constant uuid  := '0aa1a117-0000-4000-8000-000000000001';
  c_meta constant jsonb := '{"duration_s":112.4,"solved":14,"optimal":5,"tier_max":3,
                             "combo_max":9,"hints":1,"wrong_submits":2,"avg_solve_ms":6200,
                             "time_left":3.1,"combo_mult_avg":1.6,"tier_mult_avg":1.35,
                             "overdrive_bonus_score":240,"owl_energy_found":false,
                             "device":"mobile","v":"1.0.0"}'::jsonb;
  -- raw = 14*120*1.6*1.35 + 5*80 + 3*200 + 3.1*10 - 1*60 + 240 = 4839.8
  v_sid  uuid;
  v_r    jsonb;
  v_keys text[];
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'logic', now() - interval '112.4 seconds')
  returning id into v_sid;

  -- 클라이언트 4840 은 서버 재계산(4839.8)과 오차 0.2 ≤ 5% → 그대로 채택
  v_r := public.submit_game_session(v_sid, 4840, c_meta);

  assert v_r ->> 'status' = 'ok', format('정상 로직 제출인데 %s', v_r);
  assert (v_r ->> 'raw_score')::int = 4840, format('raw_score 유지 안 됨: %s', v_r ->> 'raw_score');
  assert (v_r ->> 'points')::int = 272,     format('points = 30+min(270,floor(4840/20))=272 (실제 %s)', v_r ->> 'points');
  assert (v_r ->> 'unlocked_stage')::int = 1, format('logic 제출은 해금 단계를 안 건드림: %s', v_r);

  select array_agg(k order by k) into v_keys from jsonb_object_keys(v_r) as k;
  assert v_keys = array['level_after','level_before','owl_energy','owl_energy_gained','points',
                         'rank_after','rank_before','raw_score','status','tickets_gained',
                         'total_points','unlocked_stage'],
         format('ok 응답 키 구성이 다름: %s', v_r);

  raise notice '✅ 2. 아울 로직 정상 제출 (raw 유지 / points=272 / 응답 키 12개)';
end $$;


-- ===== 3. 아울 로직 — 거부 규칙 (하나씩 격리) ===========================
do $$
declare
  c_uid  constant uuid := '0aa1a117-0000-4000-8000-000000000002';
  v_sid  uuid;
  v_r    jsonb;
  v_case jsonb;
  v_cases jsonb := jsonb_build_array(
    jsonb_build_object(
      'name', 'solved 없음', 'elapsed', 20, 'raw', 1000,
      'reason', '문제 수가 올바르지 않아요',
      'meta', jsonb_build_object('optimal',0,'tier_max',1,'hints',0,'wrong_submits',0,
               'avg_solve_ms',3000,'time_left',10,'combo_mult_avg',1.0,'tier_mult_avg',1.0,
               'overdrive_bonus_score',0)),
    jsonb_build_object(
      'name', '속도 물리적으로 불가능', 'elapsed', 11, 'raw', 1000,
      'reason', '문제를 푼 속도가 물리적으로 불가능해요',
      'meta', jsonb_build_object('solved',7,'optimal',0,'tier_max',1,'hints',0,'wrong_submits',0,
               'avg_solve_ms',5000,'time_left',1,'combo_mult_avg',1.0,'tier_mult_avg',1.0,
               'overdrive_bonus_score',0)),
    jsonb_build_object(
      'name', '풀이시간 비정상적으로 짧음', 'elapsed', 60, 'raw', 1000,
      'reason', '풀이 시간이 비정상적으로 짧아요',
      'meta', jsonb_build_object('solved',5,'optimal',0,'tier_max',1,'hints',0,'wrong_submits',0,
               'avg_solve_ms',1000,'time_left',5,'combo_mult_avg',1.0,'tier_mult_avg',1.0,
               'overdrive_bonus_score',0)),
    jsonb_build_object(
      'name', '최적화 > 해결수', 'elapsed', 60, 'raw', 1000,
      'reason', '최적화 횟수가 해결 수보다 많아요',
      'meta', jsonb_build_object('solved',5,'optimal',6,'tier_max',1,'hints',0,'wrong_submits',0,
               'avg_solve_ms',3000,'time_left',5,'combo_mult_avg',1.0,'tier_mult_avg',1.0,
               'overdrive_bonus_score',0)),
    jsonb_build_object(
      'name', '티어-해결수 불일치', 'elapsed', 60, 'raw', 1000,
      'reason', '도달 티어가 해결 수와 맞지 않아요',
      'meta', jsonb_build_object('solved',3,'optimal',0,'tier_max',2,'hints',0,'wrong_submits',0,
               'avg_solve_ms',3000,'time_left',5,'combo_mult_avg',1.0,'tier_mult_avg',1.0,
               'overdrive_bonus_score',0)),
    jsonb_build_object(
      'name', '플레이시간 위조', 'elapsed', 60, 'raw', 1000,
      'reason', '플레이 시간이 서버 기록과 맞지 않아요',
      'meta', jsonb_build_object('solved',5,'optimal',0,'tier_max',1,'hints',0,'wrong_submits',0,
               'avg_solve_ms',3000,'time_left',5,'combo_mult_avg',1.0,'tier_mult_avg',1.0,
               'overdrive_bonus_score',0,'duration_s',70)),
    jsonb_build_object(
      'name', '정답률100%+2초미만', 'elapsed', 60, 'raw', 1000,
      'reason', '비정상적인 기록이에요',
      'meta', jsonb_build_object('solved',10,'optimal',0,'tier_max',3,'hints',0,'wrong_submits',0,
               'avg_solve_ms',1500,'time_left',5,'combo_mult_avg',1.0,'tier_mult_avg',1.0,
               'overdrive_bonus_score',0,'duration_s',60))
  );
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  for v_case in select * from jsonb_array_elements(v_cases) loop
    insert into public.game_sessions (user_id, game, started_at)
    values (c_uid, 'logic', now() - make_interval(secs => (v_case ->> 'elapsed')::double precision))
    returning id into v_sid;

    v_r := public.submit_game_session(v_sid, (v_case ->> 'raw')::int, v_case -> 'meta');

    assert v_r ->> 'status' = 'rejected',
           format('[%s] rejected 여야 하는데 %s', v_case ->> 'name', v_r);
    assert v_r ->> 'reason' = v_case ->> 'reason',
           format('[%s] 거부 사유가 "%s" (기대 "%s")', v_case ->> 'name', v_r ->> 'reason', v_case ->> 'reason');
    assert (v_r ->> 'points')::int = 0,
           format('[%s] 거부 시 포인트는 0 (실제 %s)', v_case ->> 'name', v_r ->> 'points');
  end loop;

  -- 거부는 랭킹/포인트에 아무 영향이 없어야 한다
  assert (select total_points from public.profiles where id = c_uid) = 0,
         format('거부 케이스가 포인트를 건드림: %s', (select total_points from public.profiles where id = c_uid));

  -- 응답 키 구성(rejected, reason 포함 13개) 확인 — 마지막 케이스 재사용
  declare
    v_keys text[];
  begin
    select array_agg(k order by k) into v_keys from jsonb_object_keys(v_r) as k;
    assert v_keys = array['level_after','level_before','owl_energy','owl_energy_gained','points',
                           'rank_after','rank_before','raw_score','reason','status','tickets_gained',
                           'total_points','unlocked_stage'],
           format('rejected 응답 키 구성이 다름: %s', v_r);
  end;

  raise notice '✅ 3. 아울 로직 거부 규칙 7종 개별 격리 통과 (solved / 속도 / 풀이시간 / 최적화 / 티어 / 시간위조 / 100%%+속전)';
end $$;


-- ===== 4. 아울 로직 — 3배 뻥튀기 → 서버값으로 하향 보정 ================
do $$
declare
  c_uid  constant uuid  := '0aa1a117-0000-4000-8000-000000000003';
  c_meta constant jsonb := '{"duration_s":112.4,"solved":14,"optimal":5,"tier_max":3,
                             "combo_max":9,"hints":1,"wrong_submits":2,"avg_solve_ms":6200,
                             "time_left":3.1,"combo_mult_avg":1.6,"tier_mult_avg":1.35,
                             "overdrive_bonus_score":240,"owl_energy_found":false,
                             "device":"mobile","v":"1.0.0"}'::jsonb;
  -- raw_server = 4839.8 → round = 4840. 클라 14519(=round(4839.8*3))은 5% 밴드 훨씬 밖.
  v_sid uuid;
  v_r   jsonb;
  v_row public.game_sessions%rowtype;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'logic', now() - interval '112.4 seconds')
  returning id into v_sid;

  v_r := public.submit_game_session(v_sid, 14519, c_meta);

  assert v_r ->> 'status' = 'ok', format('메타가 정상이면 거부가 아니라 보정이어야 함: %s', v_r);
  assert (v_r ->> 'raw_score')::int = 4840, format('서버 재계산값 4840 을 써야 함 (실제 %s)', v_r ->> 'raw_score');
  assert (v_r ->> 'points')::int = 272,     format('보정 후 포인트는 272 (실제 %s)', v_r ->> 'points');

  select * into v_row from public.game_sessions where id = v_sid;
  assert (v_row.meta ->> 'raw_adjusted')::boolean, format('raw_adjusted 가 true 여야 함: %s', v_row.meta);
  assert (v_row.meta ->> 'raw_client')::numeric = 14519, format('raw_client 불일치: %s', v_row.meta);
  assert (v_row.meta ->> 'raw_server')::numeric = 4839.8, format('raw_server 불일치: %s', v_row.meta);

  raise notice '✅ 4. 아울 로직 3배 뻥튀기 → 서버값(4840)으로 하향 보정 확인';
end $$;


-- ===== 5. 아울 서바이버즈 — 정상 제출 (stage 1) =========================
do $$
declare
  c_uid  constant uuid  := '0aa1a117-0000-4000-8000-000000000004';
  c_meta constant jsonb := '{"duration_s":150,"kills":400,"level":14,"evolutions":1,
                             "elite_kills":3,"boss_killed":false,"zones_cleared":2,
                             "stage":1,"damage_taken":100,"build":["feather_storm"],
                             "owl_energy_found":false,"device":"mobile","v":"1.0.0"}'::jsonb;
  -- raw = 400*3 + 150*8 + 14*40 + 1*300 + 3*50 + 0 + 2*150 = 3710 (×1.0)
  v_sid uuid;
  v_r   jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '150 seconds')
  returning id into v_sid;

  v_r := public.submit_game_session(v_sid, 3710, c_meta);

  assert v_r ->> 'status' = 'ok', format('정상 서바이버즈 제출인데 %s', v_r);
  assert (v_r ->> 'raw_score')::int = 3710, format('raw_score 유지 안 됨: %s', v_r ->> 'raw_score');
  assert (v_r ->> 'points')::int = 153,     format('points = 30+min(270,floor(3710/30))=153 (실제 %s)', v_r ->> 'points');
  -- zones_cleared=2 < 3 이고 survived_sec=150 < 178 → 클리어 아님 → 해금 단계 그대로 1
  assert (v_r ->> 'unlocked_stage')::int = 1, format('클리어가 아니면 해금 단계가 그대로여야 함: %s', v_r);

  raise notice '✅ 5. 아울 서바이버즈 정상 제출(stage1) — raw=3710 / points=215';
end $$;


-- ===== 6. 아울 서바이버즈 — 거부 규칙 (하나씩 격리) =======================
do $$
declare
  c_uid  constant uuid := '0aa1a117-0000-4000-8000-000000000005';
  v_sid  uuid;
  v_r    jsonb;
  v_case jsonb;
  v_cases jsonb := jsonb_build_array(
    jsonb_build_object(
      'name', '처치수 물리적으로 불가능', 'elapsed', 20, 'raw', 1000,
      'reason', '처치 수가 물리적으로 불가능해요',
      'meta', jsonb_build_object('kills',200,'level',5,'evolutions',0,'elite_kills',0,
               'boss_killed',false,'zones_cleared',0,'stage',1,'duration_s',20)),
    jsonb_build_object(
      'name', '레벨 상한 초과', 'elapsed', 30, 'raw', 1000,
      'reason', '레벨이 상한을 넘었어요',
      'meta', jsonb_build_object('kills',100,'level',21,'evolutions',0,'elite_kills',0,
               'boss_killed',false,'zones_cleared',0,'stage',1,'duration_s',30)),
    jsonb_build_object(
      'name', '진화수 상한 초과', 'elapsed', 30, 'raw', 1000,
      'reason', '진화 수가 상한을 넘었어요',
      'meta', jsonb_build_object('kills',100,'level',10,'evolutions',4,'elite_kills',0,
               'boss_killed',false,'zones_cleared',0,'stage',1,'duration_s',30)),
    jsonb_build_object(
      'name', '보스 처치시간 불일치', 'elapsed', 100, 'raw', 1000,
      'reason', '보스 처치 시간이 맞지 않아요',
      'meta', jsonb_build_object('kills',500,'level',15,'evolutions',1,'elite_kills',2,
               'boss_killed',true,'zones_cleared',1,'stage',1,'duration_s',100)),
    jsonb_build_object(
      'name', '구역클리어 시간 불일치', 'elapsed', 50, 'raw', 1000,
      'reason', '구역 클리어가 시간과 맞지 않아요',
      'meta', jsonb_build_object('kills',100,'level',10,'evolutions',0,'elite_kills',0,
               'boss_killed',false,'zones_cleared',1,'stage',1,'duration_s',50)),
    jsonb_build_object(
      'name', '스테이지 값 오류', 'elapsed', 30, 'raw', 1000,
      'reason', '스테이지 값이 올바르지 않아요',
      'meta', jsonb_build_object('kills',100,'level',10,'evolutions',0,'elite_kills',0,
               'boss_killed',false,'zones_cleared',0,'stage',4,'duration_s',30)),
    jsonb_build_object(
      'name', '해금 안 된 스테이지', 'elapsed', 30, 'raw', 1000,
      'reason', '아직 열리지 않은 스테이지예요',
      'meta', jsonb_build_object('kills',100,'level',10,'evolutions',0,'elite_kills',0,
               'boss_killed',false,'zones_cleared',0,'stage',2,'duration_s',30)),
    jsonb_build_object(
      'name', '플레이시간 위조', 'elapsed', 30, 'raw', 1000,
      'reason', '플레이 시간이 서버 기록과 맞지 않아요',
      'meta', jsonb_build_object('kills',100,'level',10,'evolutions',0,'elite_kills',0,
               'boss_killed',false,'zones_cleared',0,'stage',1,'duration_s',40))
  );
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);
  -- 이 유저의 해금 단계는 기본값(1) — '해금 안 된 스테이지' 케이스(stage 2)가 이걸로 걸린다.

  for v_case in select * from jsonb_array_elements(v_cases) loop
    insert into public.game_sessions (user_id, game, started_at)
    values (c_uid, 'survive', now() - make_interval(secs => (v_case ->> 'elapsed')::double precision))
    returning id into v_sid;

    v_r := public.submit_game_session(v_sid, (v_case ->> 'raw')::int, v_case -> 'meta');

    assert v_r ->> 'status' = 'rejected',
           format('[%s] rejected 여야 하는데 %s', v_case ->> 'name', v_r);
    assert v_r ->> 'reason' = v_case ->> 'reason',
           format('[%s] 거부 사유가 "%s" (기대 "%s")', v_case ->> 'name', v_r ->> 'reason', v_case ->> 'reason');
    assert (v_r ->> 'points')::int = 0,
           format('[%s] 거부 시 포인트는 0 (실제 %s)', v_case ->> 'name', v_r ->> 'points');
  end loop;

  assert (select total_points from public.profiles where id = c_uid) = 0,
         format('거부 케이스가 포인트를 건드림: %s', (select total_points from public.profiles where id = c_uid));
  assert (select coalesce((meta->>'survive_unlock')::int,1) from public.profiles where id = c_uid) = 1,
         '거부 케이스가 해금 단계를 건드리면 안 됨';

  raise notice '✅ 6. 아울 서바이버즈 거부 규칙 8종 개별 격리 통과 (처치수/레벨/진화/보스/구역/스테이지값/해금/시간위조)';
end $$;


-- ===== 7. 아울 서바이버즈 — 스테이지 해금 (클리어 시에만 전진) ===========
do $$
declare
  c_uid  constant uuid  := '0aa1a117-0000-4000-8000-000000000006';
  -- 7.1 클리어: zones_cleared=3 → 해금이 1 → 2 로 전진해야 함
  c_meta_clear constant jsonb := '{"duration_s":180,"kills":700,"level":18,"evolutions":1,
                                   "elite_kills":4,"boss_killed":false,"zones_cleared":3,
                                   "stage":1,"owl_energy_found":false}'::jsonb;
  -- 7.2 비클리어: zones_cleared=1, survived_sec=90(<178) → 해금 유지(2)
  c_meta_noclr constant jsonb := '{"duration_s":90,"kills":300,"level":10,"evolutions":1,
                                   "elite_kills":0,"boss_killed":false,"zones_cleared":1,
                                   "stage":2,"owl_energy_found":false}'::jsonb;
  v_sid uuid;
  v_r   jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  assert coalesce((select (meta->>'survive_unlock')::int from public.profiles where id = c_uid), 1) = 1,
         '테스트 시작 전 해금 단계는 기본값 1 이어야 함';

  -- 7.1 클리어 런 (stage 1) → 해금 1→2
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '180 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 5210, c_meta_clear);

  assert v_r ->> 'status' = 'ok', format('클리어 런이 거부됨: %s', v_r);
  assert (v_r ->> 'unlocked_stage')::int = 2, format('클리어 후 해금은 2 여야 함: %s', v_r);
  assert (select (meta->>'survive_unlock')::int from public.profiles where id = c_uid) = 2,
         format('profiles.meta.survive_unlock 이 2 로 저장돼야 함 (실제 %s)',
                (select meta from public.profiles where id = c_uid));

  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';

  -- 7.2 비클리어 런 (stage 2, 이제 해금돼 있음) → 해금은 2 에 그대로 머물러야 함(3 으로 안 감)
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '90 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 3088, c_meta_noclr);

  assert v_r ->> 'status' = 'ok', format('비클리어 런이 거부됨: %s', v_r);
  assert (v_r ->> 'unlocked_stage')::int = 2, format('비클리어는 해금을 올리면 안 됨: %s', v_r);
  assert (select (meta->>'survive_unlock')::int from public.profiles where id = c_uid) = 2,
         'profiles.meta.survive_unlock 이 비클리어 후에도 2 로 유지돼야 함';

  raise notice '✅ 7. 아울 서바이버즈 스테이지 해금 — 클리어 시 1→2 전진 / 비클리어 시 유지';
end $$;


-- ===== 8. 아울 서바이버즈 — 스테이지 배율별 원점수 재계산 ================
do $$
declare
  c_uid   constant uuid  := '0aa1a117-0000-4000-8000-000000000007';
  c_meta  constant jsonb := '{"duration_s":100,"kills":100,"level":10,"evolutions":1,
                              "elite_kills":2,"boss_killed":false,"zones_cleared":0,
                              "owl_energy_found":false}'::jsonb;
  -- base = 100*3 + 100*8 + 10*40 + 1*300 + 2*50 + 0 + 0 = 1900
  v_sid uuid;
  v_r   jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);
  update public.profiles set meta = jsonb_set(meta, '{survive_unlock}', '3'::jsonb, true) where id = c_uid;

  -- stage 1: ×1.0 → raw 1900, points 93 (K=30)
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '100 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 1900, c_meta || '{"stage":1}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('[stage1] 거부됨: %s', v_r);
  assert (v_r ->> 'raw_score')::int = 1900, format('[stage1] raw 는 1900 (실제 %s)', v_r ->> 'raw_score');
  assert (v_r ->> 'points')::int = 93,      format('[stage1] points 는 93 (실제 %s)', v_r ->> 'points');
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';

  -- stage 2: ×1.25 → raw 2375, points 109 (K=30)
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '100 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 2375, c_meta || '{"stage":2}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('[stage2] 거부됨: %s', v_r);
  assert (v_r ->> 'raw_score')::int = 2375, format('[stage2] raw 는 2375 (실제 %s)', v_r ->> 'raw_score');
  assert (v_r ->> 'points')::int = 109,     format('[stage2] points 는 109 (실제 %s)', v_r ->> 'points');
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';

  -- stage 3: ×1.5 → raw 2850, points 125 (K=30)
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '100 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 2850, c_meta || '{"stage":3}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('[stage3] 거부됨: %s', v_r);
  assert (v_r ->> 'raw_score')::int = 2850, format('[stage3] raw 는 2850 (실제 %s)', v_r ->> 'raw_score');
  assert (v_r ->> 'points')::int = 125,     format('[stage3] points 는 125 (실제 %s)', v_r ->> 'points');

  raise notice '✅ 8. 아울 서바이버즈 스테이지 배율(1.0/1.25/1.5)별 원점수 재계산 확인';
end $$;


-- ===== 9. 아울 에너지 인게임 드랍 — logic(tier_max≥4) / survive(구역3·보스) ==
do $$
declare
  c_logic constant uuid := '0aa1a117-0000-4000-8000-000000000008';
  c_sv    constant uuid := '0aa1a117-0000-4000-8000-000000000009';
  v_sid   uuid;
  v_r     jsonb;
begin
  -- 9.1 아울 로직: tier_max=4 (solved=13, 임계값 충족) → 지급
  perform set_config('request.jwt.claim.sub', c_logic::text, true);
  update public.profiles set owl_energy = 5, owl_energy_at = now() where id = c_logic;

  insert into public.game_sessions (user_id, game, started_at)
  values (c_logic, 'logic', now() - interval '40 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 5000,
    jsonb_build_object('solved',13,'optimal',5,'tier_max',4,'hints',0,'wrong_submits',1,
                        'avg_solve_ms',3000,'time_left',5,'combo_mult_avg',1.2,'tier_mult_avg',1.2,
                        'overdrive_bonus_score',0,'duration_s',40,'owl_energy_found',true));
  assert v_r ->> 'status' = 'ok', format('[logic tier4] 거부됨: %s', v_r);
  assert (v_r ->> 'owl_energy_gained')::int = 1, format('[logic tier4] 드랍이 지급돼야 함: %s', v_r);
  assert (v_r ->> 'owl_energy')::int = 6,        format('[logic tier4] 에너지 6 이어야 함 (실제 %s)', v_r ->> 'owl_energy');

  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_logic and status = 'submitted';

  -- 9.2 아울 로직: tier_max=3 (임계값 미달) → 지급 안 함
  insert into public.game_sessions (user_id, game, started_at)
  values (c_logic, 'logic', now() - interval '50 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 4000,
    jsonb_build_object('solved',10,'optimal',5,'tier_max',3,'hints',0,'wrong_submits',1,
                        'avg_solve_ms',3000,'time_left',5,'combo_mult_avg',1.2,'tier_mult_avg',1.2,
                        'overdrive_bonus_score',0,'duration_s',50,'owl_energy_found',true));
  assert v_r ->> 'status' = 'ok', format('[logic tier3] 거부됨: %s', v_r);
  assert (v_r ->> 'owl_energy_gained')::int = 0, format('[logic tier3] 임계값 미달인데 지급됨: %s', v_r);
  assert (v_r ->> 'owl_energy')::int = 6,        format('[logic tier3] 에너지는 그대로 6 (실제 %s)', v_r ->> 'owl_energy');

  -- 9.3 아울 서바이버즈: boss_killed=true → 지급 (zones_cleared 는 3 미만이어도 무방)
  perform set_config('request.jwt.claim.sub', c_sv::text, true);
  update public.profiles set owl_energy = 5, owl_energy_at = now() where id = c_sv;

  insert into public.game_sessions (user_id, game, started_at)
  values (c_sv, 'survive', now() - interval '170 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 5000,
    jsonb_build_object('kills',500,'level',15,'evolutions',1,'elite_kills',2,'boss_killed',true,
                        'zones_cleared',2,'stage',1,'duration_s',170,'owl_energy_found',true));
  assert v_r ->> 'status' = 'ok', format('[survive boss] 거부됨: %s', v_r);
  assert (v_r ->> 'owl_energy_gained')::int = 1, format('[survive boss] 드랍이 지급돼야 함: %s', v_r);
  assert (v_r ->> 'owl_energy')::int = 6,        format('[survive boss] 에너지 6 이어야 함 (실제 %s)', v_r ->> 'owl_energy');

  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_sv and status = 'submitted';

  -- 9.4 아울 서바이버즈: boss_killed=false, zones_cleared=2(<3) → 지급 안 함
  insert into public.game_sessions (user_id, game, started_at)
  values (c_sv, 'survive', now() - interval '170 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 5000,
    jsonb_build_object('kills',500,'level',15,'evolutions',1,'elite_kills',2,'boss_killed',false,
                        'zones_cleared',2,'stage',1,'duration_s',170,'owl_energy_found',true));
  assert v_r ->> 'status' = 'ok', format('[survive 미달] 거부됨: %s', v_r);
  assert (v_r ->> 'owl_energy_gained')::int = 0, format('[survive 미달] 조건 미달인데 지급됨: %s', v_r);
  assert (v_r ->> 'owl_energy')::int = 6,        format('[survive 미달] 에너지는 그대로 6 (실제 %s)', v_r ->> 'owl_energy');

  raise notice '✅ 9. 아울 에너지 인게임 드랍 — logic(tier_max≥4)/survive(구역3 또는 보스) 지급, 미달 시 미지급';
end $$;


-- ===== 10. typer / flight / phish 는 이 마이그레이션의 영향을 받지 않는다 ==
do $$
declare
  c_uid     constant uuid  := '0aa1a117-0000-4000-8000-000000000010';
  c_meta_ok constant jsonb := '{"distance_m":1284,"duration_s":92.4,"pass_count":61,
                                "near_miss":14,"combo_max":27,"combo_mult_avg":1.8,
                                "items":23,"item_score":640,"energy_left":38,
                                "phase_max":3,"special_cleared":1,
                                "size_end":"M","build":"1.0.0"}'::jsonb;
  -- flight raw = 1284 + 61*10*1.8 + 14*25*1.8 + 640 + 1*200 + 38*2 = 3928
  v_sid uuid;
  v_r   jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  -- typer
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'typer', now() - interval '40 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 2000, '{"chars":410,"combo_max":12}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('typer 가 거부됨: %s', v_r);
  assert (v_r ->> 'raw_score')::int = 2000, format('typer raw_score 가 바뀜: %s', v_r ->> 'raw_score');
  assert (v_r ->> 'points')::int = 30 + least(270, floor(2000::numeric / 4))::int,
         format('typer 포인트 %s (기대 300)', v_r ->> 'points');
  assert (v_r ->> 'unlocked_stage')::int = 1, format('typer 도 unlocked_stage 키를 가져야 함: %s', v_r);

  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';

  -- flight (기존 재계산 로직이 그대로 살아있는지)
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'flight', now() - interval '92 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 4000, c_meta_ok);
  assert v_r ->> 'status' = 'ok', format('flight 가 거부됨: %s', v_r);
  assert (v_r ->> 'raw_score')::int = 4000, format('flight raw_score(±5%% 이내 유지) 가 바뀜: %s', v_r ->> 'raw_score');
  assert (v_r ->> 'points')::int = 230,     format('flight 포인트 %s (기대 230)', v_r ->> 'points');
  assert (v_r ->> 'unlocked_stage')::int = 1, format('flight 도 unlocked_stage 키를 가져야 함: %s', v_r);

  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';

  -- phish
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'phish', now() - interval '60 seconds')
  returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 1500, '{"correct":12,"streak_max":7}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('phish 가 거부됨: %s', v_r);
  assert (v_r ->> 'raw_score')::int = 1500, format('phish raw_score 가 바뀜: %s', v_r ->> 'raw_score');
  assert (v_r ->> 'points')::int = 30 + least(270, floor(1500::numeric / 10))::int,
         format('phish 포인트 %s (기대 180)', v_r ->> 'points');
  assert (v_r ->> 'unlocked_stage')::int = 1, format('phish 도 unlocked_stage 키를 가져야 함: %s', v_r);

  raise notice '✅ 10. typer / flight / phish 무영향 확인 (기존 재계산 로직 유지 + unlocked_stage 키 포함)';
end $$;

do $$
begin
  raise notice '🎉 new_games: 설정/스키마 · 로직 정상제출·거부7종·뻥튀기보정 · 서바이버즈 정상제출·거부8종·해금·배율재계산 · 에너지드랍 · 기존게임 무영향 모두 통과';
end $$;

rollback;
