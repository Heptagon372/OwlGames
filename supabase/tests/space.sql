-- =====================================================================
-- OWL GAMES — 아울스페이스 서버 검증
--   대상: 20260929000000_space.sql
--   명세: OWLSPACE_GDD.md §10 (점수·메타·거부 조건) · §6 (해금)
--
--   실행: psql "<connection-string>" -f supabase/tests/space.sql
--   결과: 오류 없이 끝나면 통과 (섹션마다 NOTICE 로 요약 출력)
--
--   주의: 전부 트랜잭션 안에서 돌고 마지막에 rollback 한다.
-- =====================================================================

begin;
set local plpgsql.check_asserts = on;

-- ===== 0. 테스트 유저 ================================================
do $$
declare
  c_ok     constant uuid := '0aa15ace-0000-4000-8000-000000000001';
  c_bad    constant uuid := '0aa15ace-0000-4000-8000-000000000002';
  c_stage  constant uuid := '0aa15ace-0000-4000-8000-000000000003';
  c_energy constant uuid := '0aa15ace-0000-4000-8000-000000000004';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (c_ok,     '999700001@owlgames.local', jsonb_build_object('name', '스페정상',   'student_id', '999700001')),
    (c_bad,    '999700002@owlgames.local', jsonb_build_object('name', '스페거부',   'student_id', '999700002')),
    (c_stage,  '999700003@owlgames.local', jsonb_build_object('name', '스페해금',   'student_id', '999700003')),
    (c_energy, '999700004@owlgames.local', jsonb_build_object('name', '스페에너지', 'student_id', '999700004'));

  update public.profiles set verified = true where id in (c_ok, c_bad, c_stage, c_energy);
  raise notice '테스트 유저 4명 준비 완료';
end $$;


-- ===== 1. 설정 / enum (§15) =========================================
do $$
declare
  v_lim   jsonb := public.cfg('game_limits');
  v_guard jsonb := public.cfg('game_guards');
  v_k     jsonb := public.cfg('game_k');
begin
  assert exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'game_id' and e.enumlabel = 'space'
  ), 'game_id enum 에 space 가 없음';

  assert (v_k ->> 'space')::numeric = 20, format('K_space 는 20: %s', v_k);
  assert (v_lim -> 'space' ->> 'min_sec')::numeric = 20,  format('space min_sec: %s', v_lim);
  assert (v_lim -> 'space' ->> 'max_sec')::numeric = 200, format('space max_sec: %s', v_lim);

  assert (v_guard -> 'space' ->> 'max_kills_per_sec')::numeric = 6,  format('guards: %s', v_guard);
  assert (v_guard -> 'space' ->> 'max_graze_per_sec')::numeric = 12, format('guards: %s', v_guard);
  assert (v_guard -> 'space' ->> 'max_lives')::numeric = 3,          format('guards: %s', v_guard);
  assert (v_guard -> 'space' ->> 'min_clear_sec')::numeric = 55,     format('guards: %s', v_guard);

  -- 기존 게임 설정은 그대로여야 한다
  assert (v_k ->> 'survive')::numeric = 20, 'survive K 가 바뀌면 안 됨';
  assert (v_k ->> 'typer')::numeric = 4,    'typer K 가 바뀌면 안 됨';

  raise notice '✅ 1. enum / K=20 / game_limits / game_guards';
end $$;


-- ===== 2. 정상 제출 + 원점수 재계산 (§10.1) ==========================
do $$
declare
  c_uid constant uuid := '0aa15ace-0000-4000-8000-000000000001';
  -- 처치 214 · 그레이즈 183 · 칩 96 · 118초 · 보스 격파 · 클리어 · 생명 2 · 봄 1 · 피격 1
  --   raw = (214×4 + 183×15 + 96×2 + 118×5 + 500 + 1000 + 600 + 100) × 1.0 = 5,043
  c_meta constant jsonb := '{"stage":1,"cleared":true,"duration_s":118,"kills":214,"graze":183,
                             "chips":96,"lives_left":2,"bombs_unused":1,"damage_taken":1,
                             "boss_killed":true,"skills":["M3:2","S2:1"],"theme":"dark",
                             "device":"mobile","v":"1.0.0"}'::jsonb;
  v_sid uuid;
  v_r   jsonb;
  v_exp numeric := (214 * 4 + 183 * 15 + 96 * 2 + 118 * 5 + 500 + 1000 + 2 * 300 + 1 * 100) * 1.0;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'space', now() - interval '120 seconds')
  returning id into v_sid;

  v_r := public.submit_game_session(v_sid, round(v_exp)::int, c_meta);

  assert v_r ->> 'status' = 'ok', format('정상 제출인데 %s', v_r);
  assert (v_r ->> 'raw_score')::int = round(v_exp)::int,
         format('raw %s (실제 %s)', round(v_exp), v_r ->> 'raw_score');
  -- points = 30 + min(270, floor(raw/20))
  assert (v_r ->> 'points')::int = 30 + least(270, floor(v_exp / 20))::int,
         format('points 계산이 다름: %s', v_r);
  assert (v_r ->> 'unlocked_stage')::int = 1, format('클리어했으니 해금 1: %s', v_r);

  raise notice '✅ 2. 정상 제출 — 그레이즈 183 반영 / 해금 1';
end $$;


-- ===== 3. 무피격 보너스 · 스테이지 배율 ==============================
do $$
declare
  c_uid constant uuid := '0aa15ace-0000-4000-8000-000000000001';
  v_sid uuid;
  v_r   jsonb;
  -- 스테이지 5 (배율 1.24), 무피격 클리어 → +600
  v_exp numeric := (100 * 4 + 200 * 15 + 50 * 2 + 100 * 5 + 500 + 1000 + 3 * 300 + 600 + 2 * 100) * 1.24;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';
  update public.profiles set meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{space_stage}', '4'::jsonb, true)
   where id = c_uid;

  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'space', now() - interval '102 seconds')
  returning id into v_sid;

  v_r := public.submit_game_session(v_sid, round(v_exp)::int,
    '{"stage":5,"cleared":true,"duration_s":100,"kills":100,"graze":200,"chips":50,
      "lives_left":3,"bombs_unused":2,"damage_taken":0,"boss_killed":true,
      "skills":["M1:3"],"theme":"light","v":"1.0.0"}'::jsonb);

  assert v_r ->> 'status' = 'ok', format('무피격 클리어인데 %s', v_r);
  assert (v_r ->> 'raw_score')::int = round(v_exp)::int,
         format('무피격+배율 raw %s (실제 %s)', round(v_exp), v_r ->> 'raw_score');
  assert (v_r ->> 'unlocked_stage')::int = 5, format('5스테이지 클리어 → 해금 5: %s', v_r);
  assert (select meta ->> 'space_theme' from public.profiles where id = c_uid) = 'light',
         '테마가 저장되지 않았다';

  raise notice '✅ 3. 무피격 +600 · 배율 1.24 · 테마 저장 · 해금 전진';
end $$;


-- ===== 4. 거부 규칙 (§10.3) =========================================
do $$
declare
  c_uid constant uuid := '0aa15ace-0000-4000-8000-000000000002';
  v_sid uuid;
  v_r   jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  -- 4.1 초당 처치 6회 초과
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'space', now() - interval '100 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 9999,
    '{"stage":1,"cleared":false,"duration_s":98,"kills":900,"graze":100,"chips":10,
      "lives_left":1,"bombs_unused":0,"damage_taken":2,"boss_killed":false,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('초당 9킬인데 %s', v_r);
  assert v_r ->> 'reason' like '처치 수%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 4.2 초당 그레이즈 12회 초과
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'space', now() - interval '100 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 9999,
    '{"stage":1,"cleared":false,"duration_s":98,"kills":100,"graze":5000,"chips":10,
      "lives_left":1,"bombs_unused":0,"damage_taken":2,"boss_killed":false,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('초당 50그레이즈인데 %s', v_r);
  assert v_r ->> 'reason' like '스치기%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 4.3 생명 상한 초과
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'space', now() - interval '100 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 5000,
    '{"stage":1,"cleared":false,"duration_s":98,"kills":100,"graze":100,"chips":10,
      "lives_left":9,"bombs_unused":0,"damage_taken":0,"boss_killed":false,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('생명 9인데 %s', v_r);
  assert v_r ->> 'reason' like '남은 생명%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 4.4 생명 + 피격이 4를 넘음 (생명 3 + 보스 보상 1이 최대)
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'space', now() - interval '100 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 5000,
    '{"stage":1,"cleared":false,"duration_s":98,"kills":100,"graze":100,"chips":10,
      "lives_left":3,"bombs_unused":0,"damage_taken":3,"boss_killed":false,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('생명3+피격3인데 %s', v_r);
  assert v_r ->> 'reason' like '생명과 피격%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 4.5 55초 미만 클리어 (보스는 55초에 나온다)
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'space', now() - interval '40 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 5000,
    '{"stage":1,"cleared":true,"duration_s":38,"kills":100,"graze":100,"chips":10,
      "lives_left":3,"bombs_unused":0,"damage_taken":0,"boss_killed":true,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('38초 클리어인데 %s', v_r);
  assert v_r ->> 'reason' like '보스 등장 전%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 4.6 해금 안 된 스테이지
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'space', now() - interval '100 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 5000,
    '{"stage":9,"cleared":false,"duration_s":98,"kills":100,"graze":100,"chips":10,
      "lives_left":1,"bombs_unused":0,"damage_taken":2,"boss_killed":false,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('해금 안 된 9스테이지인데 %s', v_r);
  assert v_r ->> 'reason' like '아직 열리지%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 4.7 플레이 시간 위조
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'space', now() - interval '60 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 3000,
    '{"stage":1,"cleared":false,"duration_s":178,"kills":100,"graze":100,"chips":10,
      "lives_left":1,"bombs_unused":0,"damage_taken":2,"boss_killed":false,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('시간 위조인데 %s', v_r);
  assert v_r ->> 'reason' like '플레이 시간%', format('사유가 다름: %s', v_r ->> 'reason');

  raise notice '✅ 4. 거부 규칙 7종 (처치속도/스치기속도/생명/생명+피격/조기클리어/해금/시간위조)';
end $$;


-- ===== 5. 점수 뻥튀기 → 서버값 채택 ==================================
do $$
declare
  c_uid constant uuid := '0aa15ace-0000-4000-8000-000000000002';
  v_sid uuid;
  v_r   jsonb;
  v_m   jsonb;
  v_exp numeric := (50 * 4 + 40 * 15 + 20 * 2 + 70 * 5 + 1 * 300) * 1.0;   -- 1,490
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';

  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'space', now() - interval '72 seconds') returning id into v_sid;

  v_r := public.submit_game_session(v_sid, 99999,
    '{"stage":1,"cleared":false,"duration_s":70,"kills":50,"graze":40,"chips":20,
      "lives_left":1,"bombs_unused":0,"damage_taken":2,"boss_killed":false,"theme":"dark"}'::jsonb);

  assert v_r ->> 'status' = 'ok', format('뻥튀기는 거부가 아니라 보정: %s', v_r);
  assert (v_r ->> 'raw_score')::int = round(v_exp)::int,
         format('서버 재계산값 %s (실제 %s)', round(v_exp), v_r ->> 'raw_score');

  select meta into v_m from public.game_sessions where id = v_sid;
  assert (v_m -> 'raw_adjusted') = to_jsonb(true), format('raw_adjusted 없음: %s', v_m);

  raise notice '✅ 5. 점수 뻥튀기 → 서버값(1,490)으로 하향 보정';
end $$;


-- ===== 6. 해금 (§6) =================================================
do $$
declare
  c_uid constant uuid := '0aa15ace-0000-4000-8000-000000000003';
  v_sid uuid;
  v_r   jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  -- 1스테이지 클리어 → space_stage = 1
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'space', now() - interval '80 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 3000,
    '{"stage":1,"cleared":true,"duration_s":78,"kills":80,"graze":60,"chips":30,
      "lives_left":2,"bombs_unused":1,"damage_taken":1,"boss_killed":true,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('클리어 제출인데 %s', v_r);
  assert (v_r ->> 'unlocked_stage')::int = 1, format('해금 1 이어야 함: %s', v_r);

  -- 3스테이지는 아직 못 고른다
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'space', now() - interval '80 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 3000,
    '{"stage":3,"cleared":false,"duration_s":78,"kills":80,"graze":60,"chips":30,
      "lives_left":1,"bombs_unused":1,"damage_taken":2,"boss_killed":false,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('3스테이지는 잠겨 있어야 함: %s', v_r);

  -- 서바이버즈 해금과 서로 간섭하지 않는다
  assert coalesce((select (meta ->> 'survive_stage')::int from public.profiles where id = c_uid), 0) = 0,
         'space 제출이 survive 해금을 건드렸다';

  raise notice '✅ 6. 해금 — 클리어해야 다음 스테이지 / survive 해금과 독립';
end $$;


-- ===== 7. 아울 에너지 드랍 ==========================================
do $$
declare
  c_uid constant uuid := '0aa15ace-0000-4000-8000-000000000004';
  v_sid uuid;
  v_r   jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);
  update public.profiles
     set owl_energy = 5, owl_energy_at = now(),
         meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{space_stage}', '5'::jsonb, true)
   where id = c_uid;

  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'space', now() - interval '100 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 4000,
    '{"stage":5,"cleared":true,"duration_s":98,"kills":120,"graze":150,"chips":60,
      "lives_left":2,"bombs_unused":1,"damage_taken":1,"boss_killed":true,"theme":"dark",
      "owl_energy_found":true}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('거부됨: %s', v_r);
  assert (v_r ->> 'owl_energy_gained')::int = 1, format('드랍이 지급돼야 함: %s', v_r);

  -- 클리어하지 못하면 미지급
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'space', now() - interval '100 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 2000,
    '{"stage":5,"cleared":false,"duration_s":98,"kills":120,"graze":150,"chips":60,
      "lives_left":0,"bombs_unused":1,"damage_taken":3,"boss_killed":false,"theme":"dark",
      "owl_energy_found":true}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('거부됨: %s', v_r);
  assert (v_r ->> 'owl_energy_gained')::int = 0, format('클리어 못 했으면 미지급: %s', v_r);

  raise notice '✅ 7. 아울 에너지 드랍 — 3스테이지 이상 클리어에서만';
end $$;


-- ===== 8. 다른 게임에 영향 없음 ======================================
do $$
declare
  c_uid constant uuid := '0aa15ace-0000-4000-8000-000000000001';
  v_sid uuid;
  v_r   jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';

  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'typer', now() - interval '40 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 1200,
    '{"hits":20,"misses":1,"max_combo":9,"firewall":20,"duration_sec":39}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('타이퍼가 영향을 받았다: %s', v_r);
  -- typer 는 space 해금과 무관하므로 survive_stage 기준 값이 온다
  assert (v_r ? 'unlocked_stage'), 'unlocked_stage 키가 빠졌다';

  raise notice '✅ 8. typer 등 기존 게임 무영향';
end $$;

rollback;
