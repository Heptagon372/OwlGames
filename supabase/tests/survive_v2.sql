-- =====================================================================
-- OWL GAMES — 아울 서바이버즈 v2 서버 검증
--   대상: 20260928000000_survive_v2.sql
--   명세: OWLSURVIVORS_GDD_v2.md §11 (점수·메타·거부 조건) · §3 (해금)
--
--   실행: psql "<connection-string>" -f supabase/tests/survive_v2.sql
--   결과: 오류 없이 끝나면 통과 (섹션마다 NOTICE 로 요약 출력)
--
--   주의: 전부 트랜잭션 안에서 돌고 마지막에 rollback 한다.
-- =====================================================================

begin;
set local plpgsql.check_asserts = on;

-- ===== 0. 테스트 유저 ================================================
do $$
declare
  c_ok     constant uuid := '0aa15420-0000-4000-8000-000000000001';
  c_bad    constant uuid := '0aa15420-0000-4000-8000-000000000002';
  c_stage  constant uuid := '0aa15420-0000-4000-8000-000000000003';
  c_energy constant uuid := '0aa15420-0000-4000-8000-000000000004';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (c_ok,     '999600001@owlgames.local', jsonb_build_object('name', '서바정상', 'student_id', '999600001')),
    (c_bad,    '999600002@owlgames.local', jsonb_build_object('name', '서바거부', 'student_id', '999600002')),
    (c_stage,  '999600003@owlgames.local', jsonb_build_object('name', '서바해금', 'student_id', '999600003')),
    (c_energy, '999600004@owlgames.local', jsonb_build_object('name', '서바에너지', 'student_id', '999600004'));

  update public.profiles set verified = true
   where id in (c_ok, c_bad, c_stage, c_energy);

  raise notice '테스트 유저 4명 준비 완료';
end $$;


-- ===== 1. 설정 (§16) =================================================
do $$
declare
  v_lim   jsonb := public.cfg('game_limits');
  v_guard jsonb := public.cfg('game_guards');
  v_k     jsonb := public.cfg('game_k');
begin
  assert (v_lim -> 'survive' ->> 'min_sec')::numeric = 20,  format('survive min_sec 20: %s', v_lim);
  assert (v_lim -> 'survive' ->> 'max_sec')::numeric = 200, format('survive max_sec 200: %s', v_lim);
  assert (v_k ->> 'survive')::numeric = 20, format('K_survive 는 20 (§11.2): %s', v_k);

  assert (v_guard -> 'survive' ->> 'max_kills_per_sec')::numeric = 8,  format('guards: %s', v_guard);
  assert (v_guard -> 'survive' ->> 'max_level')::numeric = 24,         format('guards: %s', v_guard);
  assert (v_guard -> 'survive' ->> 'max_evolutions')::numeric = 3,     format('guards: %s', v_guard);
  assert (v_guard -> 'survive' ->> 'min_clear_sec')::numeric = 90,     format('guards: %s', v_guard);

  -- v1 의 구역 배율 테이블은 사라져야 한다
  assert public.cfg('survive_stages') is null, 'survive_stages 가 아직 남아 있다';

  raise notice '✅ 1. 설정 (game_limits 20~200 / K=20 / game_guards)';
end $$;


-- ===== 2. 정상 제출 + 원점수 재계산 (§11.1) ===========================
do $$
declare
  c_uid constant uuid := '0aa15420-0000-4000-8000-000000000001';
  -- 1스테이지 클리어: 처치 500 · 150초 · Lv15 · 진화 1 · 중간보스 · 장애물 10 · 피격 2
  --   raw = (500×3 + 150×6 + 15×40 + 300 + 250 + 1000 + 80) × 1.0 = 4,530
  c_meta constant jsonb := '{"stage":1,"cleared":true,"duration_s":150,"kills":500,"level":15,
                             "evolutions":1,"midboss":true,"obstacles":10,"damage_taken":2,
                             "revives_used":0,"theme":"dark","device":"mobile","v":"2.0.0"}'::jsonb;
  v_sid uuid;
  v_r   jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '152 seconds')
  returning id into v_sid;

  v_r := public.submit_game_session(v_sid, 4530, c_meta);

  assert v_r ->> 'status' = 'ok', format('정상 제출인데 %s', v_r);
  assert (v_r ->> 'raw_score')::int = 4530, format('raw 유지 안 됨: %s', v_r ->> 'raw_score');
  -- points = 30 + min(270, floor(4530/20)) = 30 + 226 = 256
  assert (v_r ->> 'points')::int = 256, format('points 256 (실제 %s)', v_r ->> 'points');
  assert (v_r ->> 'unlocked_stage')::int = 1, format('클리어했으니 해금은 1: %s', v_r);

  raise notice '✅ 2. 정상 제출 — raw 4,530 / 256P / 해금 1';
end $$;


-- ===== 3. 무피격 보너스 · 스테이지 배율 ==============================
do $$
declare
  c_uid constant uuid := '0aa15420-0000-4000-8000-000000000001';
  v_sid uuid;
  v_r   jsonb;
  v_raw numeric;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';

  -- 무피격(damage_taken=0) → +500, 스테이지 5 → 배율 1.24
  -- raw = (300×3 + 120×6 + 12×40 + 0 + 250 + 0 + 0 + 500) × 1.24 = 2,850 × 1.24 = 3,534
  v_raw := (300 * 3 + 120 * 6 + 12 * 40 + 250 + 500) * 1.24;

  update public.profiles set meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{survive_stage}', '4'::jsonb, true)
   where id = c_uid;

  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '122 seconds')
  returning id into v_sid;

  v_r := public.submit_game_session(v_sid, round(v_raw)::int,
    '{"stage":5,"cleared":false,"duration_s":120,"kills":300,"level":12,"evolutions":0,
      "midboss":true,"obstacles":0,"damage_taken":0,"revives_used":0,"theme":"light","v":"2.0.0"}'::jsonb);

  assert v_r ->> 'status' = 'ok', format('무피격 제출인데 %s', v_r);
  assert (v_r ->> 'raw_score')::int = round(v_raw)::int,
         format('무피격+배율 raw %s (실제 %s)', round(v_raw), v_r ->> 'raw_score');
  -- 클리어가 아니므로 해금은 그대로 4
  assert (v_r ->> 'unlocked_stage')::int = 4, format('비클리어는 해금 유지: %s', v_r);
  -- 테마가 저장된다 (§10.1)
  assert (select meta ->> 'survive_theme' from public.profiles where id = c_uid) = 'light',
         '테마가 저장되지 않았다';

  raise notice '✅ 3. 무피격 +500 · 스테이지 배율 1.24 · 테마 저장';
end $$;


-- ===== 4. 거부 규칙 (§11.3) ==========================================
do $$
declare
  c_uid constant uuid := '0aa15420-0000-4000-8000-000000000002';
  v_sid uuid;
  v_r   jsonb;

  procedure_meta jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  -- 4.1 초당 8킬 초과
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '100 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 9999,
    '{"stage":1,"cleared":false,"duration_s":98,"kills":2000,"level":10,"evolutions":0,
      "midboss":true,"obstacles":0,"damage_taken":5,"revives_used":0,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('초당 20킬인데 %s', v_r);
  assert v_r ->> 'reason' like '처치 수%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 4.2 레벨 상한 초과
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '100 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 5000,
    '{"stage":1,"cleared":false,"duration_s":98,"kills":300,"level":30,"evolutions":0,
      "midboss":true,"obstacles":0,"damage_taken":5,"revives_used":0,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('레벨 30인데 %s', v_r);
  assert v_r ->> 'reason' like '레벨%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 4.3 진화 상한 초과
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '100 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 5000,
    '{"stage":1,"cleared":false,"duration_s":98,"kills":300,"level":20,"evolutions":5,
      "midboss":true,"obstacles":0,"damage_taken":5,"revives_used":0,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('진화 5인데 %s', v_r);
  assert v_r ->> 'reason' like '진화%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 4.4 90초 미만 클리어 (보스는 100초에 나온다)
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '60 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 5000,
    '{"stage":1,"cleared":true,"duration_s":58,"kills":200,"level":10,"evolutions":0,
      "midboss":true,"obstacles":0,"damage_taken":5,"revives_used":0,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('58초 클리어인데 %s', v_r);
  assert v_r ->> 'reason' like '보스 등장 전%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 4.5 해금 안 된 스테이지
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '100 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 5000,
    '{"stage":9,"cleared":false,"duration_s":98,"kills":300,"level":10,"evolutions":0,
      "midboss":true,"obstacles":0,"damage_taken":5,"revives_used":0,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('해금 안 된 9스테이지인데 %s', v_r);
  assert v_r ->> 'reason' like '아직 열리지%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 4.6 중간보스 시점 위조 (40초 전)
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '30 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 1000,
    '{"stage":1,"cleared":false,"duration_s":28,"kills":100,"level":6,"evolutions":0,
      "midboss":true,"obstacles":0,"damage_taken":2,"revives_used":0,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('30초에 중간보스인데 %s', v_r);
  assert v_r ->> 'reason' like '중간보스%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 4.7 플레이 시간 위조
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '100 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 5000,
    '{"stage":1,"cleared":false,"duration_s":178,"kills":300,"level":10,"evolutions":0,
      "midboss":true,"obstacles":0,"damage_taken":5,"revives_used":0,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('시간 위조인데 %s', v_r);
  assert v_r ->> 'reason' like '플레이 시간%', format('사유가 다름: %s', v_r ->> 'reason');

  raise notice '✅ 4. 거부 규칙 7종 (처치속도/레벨/진화/조기클리어/해금/중간보스/시간위조)';
end $$;


-- ===== 5. 점수 뻥튀기 → 서버값 채택 ==================================
do $$
declare
  c_uid constant uuid := '0aa15420-0000-4000-8000-000000000002';
  v_sid uuid;
  v_r   jsonb;
  v_m   jsonb;
  v_exp numeric := (200 * 3 + 100 * 6 + 10 * 40 + 250) * 1.0;   -- 1,850
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';

  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '102 seconds') returning id into v_sid;

  v_r := public.submit_game_session(v_sid, 99999,
    '{"stage":1,"cleared":false,"duration_s":100,"kills":200,"level":10,"evolutions":0,
      "midboss":true,"obstacles":0,"damage_taken":3,"revives_used":0,"theme":"dark"}'::jsonb);

  assert v_r ->> 'status' = 'ok', format('뻥튀기는 거부가 아니라 보정: %s', v_r);
  assert (v_r ->> 'raw_score')::int = round(v_exp)::int,
         format('서버 재계산값 %s (실제 %s)', round(v_exp), v_r ->> 'raw_score');

  select meta into v_m from public.game_sessions where id = v_sid;
  assert (v_m -> 'raw_adjusted') = to_jsonb(true), format('raw_adjusted 없음: %s', v_m);

  raise notice '✅ 5. 20배 뻥튀기 → 서버값(1,850)으로 하향 보정';
end $$;


-- ===== 6. 스테이지 해금 (§3) =========================================
do $$
declare
  c_uid constant uuid := '0aa15420-0000-4000-8000-000000000003';
  v_sid uuid;
  v_r   jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  -- 처음에는 1스테이지만 고를 수 있다 (survive_stage = 0)
  assert coalesce((select (meta ->> 'survive_stage')::int from public.profiles where id = c_uid), 0) = 0,
         '초기 해금 단계는 0 이어야 한다';

  -- 1스테이지 클리어 → survive_stage = 1
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '110 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 3000,
    '{"stage":1,"cleared":true,"duration_s":108,"kills":300,"level":12,"evolutions":0,
      "midboss":true,"obstacles":5,"damage_taken":4,"revives_used":0,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('클리어 제출인데 %s', v_r);
  assert (v_r ->> 'unlocked_stage')::int = 1, format('해금 1 이어야 함: %s', v_r);

  -- 이제 2스테이지를 고를 수 있다
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '110 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 3000,
    '{"stage":2,"cleared":false,"duration_s":108,"kills":300,"level":12,"evolutions":0,
      "midboss":true,"obstacles":5,"damage_taken":4,"revives_used":0,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('2스테이지 도전인데 %s', v_r);
  assert (v_r ->> 'unlocked_stage')::int = 1, format('실패했으니 해금 유지: %s', v_r);

  -- 3스테이지는 아직 못 고른다
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '110 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 3000,
    '{"stage":3,"cleared":false,"duration_s":108,"kills":300,"level":12,"evolutions":0,
      "midboss":true,"obstacles":5,"damage_taken":4,"revives_used":0,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('3스테이지는 잠겨 있어야 함: %s', v_r);

  raise notice '✅ 6. 해금 — 클리어해야 다음 스테이지가 열린다';
end $$;


-- ===== 7. 아울 에너지 드랍 (3스테이지 이상 클리어) ====================
do $$
declare
  c_uid constant uuid := '0aa15420-0000-4000-8000-000000000004';
  v_sid uuid;
  v_r   jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);
  update public.profiles
     set owl_energy = 5, owl_energy_at = now(),
         meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{survive_stage}', '5'::jsonb, true)
   where id = c_uid;

  -- 3스테이지 이상 클리어 + owl_energy_found → 지급
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '130 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 4000,
    '{"stage":5,"cleared":true,"duration_s":128,"kills":350,"level":14,"evolutions":1,
      "midboss":true,"obstacles":6,"damage_taken":3,"revives_used":0,"theme":"dark",
      "owl_energy_found":true}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('거부됨: %s', v_r);
  assert (v_r ->> 'owl_energy_gained')::int = 1, format('드랍이 지급돼야 함: %s', v_r);

  -- 클리어하지 못하면 지급 안 함
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '130 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 3000,
    '{"stage":5,"cleared":false,"duration_s":128,"kills":350,"level":14,"evolutions":1,
      "midboss":true,"obstacles":6,"damage_taken":3,"revives_used":0,"theme":"dark",
      "owl_energy_found":true}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('거부됨: %s', v_r);
  assert (v_r ->> 'owl_energy_gained')::int = 0, format('클리어 못 했으면 미지급: %s', v_r);

  raise notice '✅ 7. 아울 에너지 드랍 — 3스테이지 이상 클리어에서만';
end $$;

rollback;
