-- =====================================================================
-- OWL GAMES — 아울 서바이버즈 v3 서버 검증
--   대상: 20261001000000_survive_v3.sql
--   명세: OWLSURVIVORS_GDD.md §11 (점수·메타·거부 조건) — v3
--
--   실행: psql "<connection-string>" -f supabase/tests/survive_v3.sql
--   결과: 오류 없이 끝나면 통과 (섹션마다 NOTICE 로 요약 출력)
--
--   주의: 전부 트랜잭션 안에서 돌고 마지막에 rollback 한다.
-- =====================================================================

begin;
set local plpgsql.check_asserts = on;

-- ===== 0. 테스트 유저 ================================================
do $$
declare
  c_ok     constant uuid := '0aa15430-0000-4000-8000-000000000001';
  c_bad    constant uuid := '0aa15430-0000-4000-8000-000000000002';
  c_best   constant uuid := '0aa15430-0000-4000-8000-000000000003';
  c_energy constant uuid := '0aa15430-0000-4000-8000-000000000004';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (c_ok,     '999610001@owlgames.local', jsonb_build_object('name', '서바정상', 'student_id', '999610001')),
    (c_bad,    '999610002@owlgames.local', jsonb_build_object('name', '서바거부', 'student_id', '999610002')),
    (c_best,   '999610003@owlgames.local', jsonb_build_object('name', '서바기록', 'student_id', '999610003')),
    (c_energy, '999610004@owlgames.local', jsonb_build_object('name', '서바에너지', 'student_id', '999610004'));

  update public.profiles set verified = true
   where id in (c_ok, c_bad, c_best, c_energy);

  raise notice '테스트 유저 4명 준비 완료';
end $$;


-- ===== 1. 설정 + 보스 수 규칙 ========================================
do $$
declare
  v_lim   jsonb := public.cfg('game_limits');
  v_guard jsonb := public.cfg('game_guards');
begin
  assert (v_lim -> 'survive' ->> 'min_sec')::numeric = 20,   format('survive min_sec 20: %s', v_lim);
  assert (v_lim -> 'survive' ->> 'max_sec')::numeric = 2400, format('survive max_sec 2400: %s', v_lim);

  assert (v_guard -> 'survive' ->> 'max_level')::numeric = 60,          format('guards: %s', v_guard);
  assert (v_guard -> 'survive' ->> 'max_evolutions')::numeric = 12,     format('guards: %s', v_guard);
  assert (v_guard -> 'survive' ->> 'min_sec_per_stage')::numeric = 15,  format('guards: %s', v_guard);

  -- 보스: 5 · 8 · 12 · 15 · 19 · 23 …
  assert public.survive_bosses_before(1)  = 0;
  assert public.survive_bosses_before(5)  = 0;
  assert public.survive_bosses_before(6)  = 1;
  assert public.survive_bosses_before(13) = 3;
  assert public.survive_bosses_before(16) = 4;
  assert public.survive_bosses_before(19) = 4;
  assert public.survive_bosses_before(20) = 5;
  assert public.survive_bosses_before(24) = 6;

  raise notice '✅ 1. 설정 (20~2400초 · guards v3) + 보스 수 규칙';
end $$;


-- ===== 2. 정상 제출 + 원점수 재계산 ==================================
do $$
declare
  c_uid constant uuid := '0aa15430-0000-4000-8000-000000000001';
  -- 6단계 도달(육각형 1마리 처치) · 처치 500 · 198초 · Lv18 · 진화 1 · 장애물 20 · 피격 3
  --   raw = 500×3 + 198×2 + 18×40 + 300 + 5×200 + 1×800 + 20×8 = 4,876
  c_meta constant jsonb := '{"stage":6,"cleared":false,"bosses":1,"duration_s":198,"kills":500,"level":18,
                             "evolutions":1,"obstacles":20,"damage_taken":3,"revives_used":0,
                             "theme":"dark","device":"mobile","v":"3.0.0"}'::jsonb;
  v_sid uuid;
  v_r   jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '200 seconds')
  returning id into v_sid;

  v_r := public.submit_game_session(v_sid, 4876, c_meta);

  assert v_r ->> 'status' = 'ok', format('정상 제출인데 %s', v_r);
  assert (v_r ->> 'raw_score')::int = 4876, format('raw 유지 안 됨: %s', v_r ->> 'raw_score');
  -- points = 30 + min(270, floor(4876/20)) = 30 + 243 = 273
  assert (v_r ->> 'points')::int = 273, format('points 273 (실제 %s)', v_r ->> 'points');
  assert (v_r ->> 'unlocked_stage')::int = 6, format('도달 단계 6 이 기록돼야: %s', v_r);

  raise notice '✅ 2. 정상 제출 — raw 4,876 / 273P / 최고 단계 6';
end $$;


-- ===== 3. 거부 규칙 ==================================================
do $$
declare
  c_uid constant uuid := '0aa15430-0000-4000-8000-000000000002';
  v_sid uuid;
  v_r   jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  -- 3.1 단계가 너무 빨리 올랐다 (10단계를 60초에)
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '60 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 5000,
    '{"stage":10,"cleared":false,"bosses":2,"duration_s":58,"kills":200,"level":10,"evolutions":0,
      "obstacles":0,"damage_taken":5,"revives_used":0,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('60초에 10단계인데 %s', v_r);
  assert v_r ->> 'reason' like '단계가 너무%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 3.2 보스 수가 단계와 안 맞는다 (6단계인데 보스 0)
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '200 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 5000,
    '{"stage":6,"cleared":false,"bosses":0,"duration_s":198,"kills":300,"level":12,"evolutions":0,
      "obstacles":0,"damage_taken":5,"revives_used":0,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('보스 수 불일치인데 %s', v_r);
  assert v_r ->> 'reason' like '보스 처치 수%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 3.3 최종 보스를 안 잡았는데 cleared
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '400 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 5000,
    '{"stage":9,"cleared":true,"bosses":2,"duration_s":398,"kills":300,"level":20,"evolutions":0,
      "obstacles":0,"damage_taken":5,"revives_used":0,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('9단계 cleared 인데 %s', v_r);
  assert v_r ->> 'reason' like '최종 보스%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 3.4 초당 8킬 초과
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '100 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 9999,
    '{"stage":2,"cleared":false,"bosses":0,"duration_s":98,"kills":2000,"level":10,"evolutions":0,
      "obstacles":0,"damage_taken":5,"revives_used":0,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('초당 20킬인데 %s', v_r);
  assert v_r ->> 'reason' like '처치 수%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 3.5 레벨 상한 초과
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '100 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 5000,
    '{"stage":2,"cleared":false,"bosses":0,"duration_s":98,"kills":300,"level":70,"evolutions":0,
      "obstacles":0,"damage_taken":5,"revives_used":0,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('레벨 70인데 %s', v_r);
  assert v_r ->> 'reason' like '레벨%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 3.6 진화 상한 초과
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '100 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 5000,
    '{"stage":2,"cleared":false,"bosses":0,"duration_s":98,"kills":300,"level":20,"evolutions":13,
      "obstacles":0,"damage_taken":5,"revives_used":0,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('진화 13인데 %s', v_r);
  assert v_r ->> 'reason' like '진화%', format('사유가 다름: %s', v_r ->> 'reason');

  -- 3.7 플레이 시간 위조
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '100 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 5000,
    '{"stage":2,"cleared":false,"bosses":0,"duration_s":178,"kills":300,"level":10,"evolutions":0,
      "obstacles":0,"damage_taken":5,"revives_used":0,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('시간 위조인데 %s', v_r);
  assert v_r ->> 'reason' like '플레이 시간%', format('사유가 다름: %s', v_r ->> 'reason');

  raise notice '✅ 3. 거부 규칙 7종 (단계속도/보스수/최종보스/처치속도/레벨/진화/시간위조)';
end $$;


-- ===== 4. 점수 뻥튀기 → 서버값 채택 ==================================
do $$
declare
  c_uid constant uuid := '0aa15430-0000-4000-8000-000000000002';
  v_sid uuid;
  v_r   jsonb;
  v_m   jsonb;
  -- 3단계 · 처치 200 · 100초 · Lv10 · 피격 3 → 600 + 200 + 400 + 400 = 1,600
  v_exp numeric := 200 * 3 + 100 * 2 + 10 * 40 + 2 * 200;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';

  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '102 seconds') returning id into v_sid;

  v_r := public.submit_game_session(v_sid, 99999,
    '{"stage":3,"cleared":false,"bosses":0,"duration_s":100,"kills":200,"level":10,"evolutions":0,
      "obstacles":0,"damage_taken":3,"revives_used":0,"theme":"dark"}'::jsonb);

  assert v_r ->> 'status' = 'ok', format('뻥튀기는 거부가 아니라 보정: %s', v_r);
  assert (v_r ->> 'raw_score')::int = round(v_exp)::int,
         format('서버 재계산값 %s (실제 %s)', round(v_exp), v_r ->> 'raw_score');

  select meta into v_m from public.game_sessions where id = v_sid;
  assert (v_m -> 'raw_adjusted') = to_jsonb(true), format('raw_adjusted 없음: %s', v_m);

  raise notice '✅ 4. 뻥튀기 → 서버값(1,600)으로 하향 보정';
end $$;


-- ===== 5. 최고 도달 단계 — 죽어도 갱신, 내려가지 않는다 ===============
do $$
declare
  c_uid constant uuid := '0aa15430-0000-4000-8000-000000000003';
  v_sid uuid;
  v_r   jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  -- 9단계 도달 (보스 2)
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '320 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 7000,
    '{"stage":9,"cleared":false,"bosses":2,"duration_s":318,"kills":700,"level":24,"evolutions":1,
      "obstacles":40,"damage_taken":6,"revives_used":1,"theme":"light"}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('9단계 제출인데 %s', v_r);
  assert (v_r ->> 'unlocked_stage')::int = 9, format('최고 단계 9: %s', v_r);
  assert (select meta ->> 'survive_theme' from public.profiles where id = c_uid) = 'light', '테마 저장 안 됨';

  -- 다음 판은 3단계에서 끝 — 최고 기록은 9 그대로
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '80 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 1500,
    '{"stage":3,"cleared":false,"bosses":0,"duration_s":78,"kills":150,"level":8,"evolutions":0,
      "obstacles":5,"damage_taken":4,"revives_used":0,"theme":"dark"}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('3단계 제출인데 %s', v_r);
  assert (v_r ->> 'unlocked_stage')::int = 9, format('최고 기록은 유지: %s', v_r);

  raise notice '✅ 5. survive_stage = 도달한 최고 단계 (내려가지 않음)';
end $$;


-- ===== 6. 아울 에너지 드랍 (6단계 이상 도달) =========================
do $$
declare
  c_uid constant uuid := '0aa15430-0000-4000-8000-000000000004';
  v_sid uuid;
  v_r   jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);
  update public.profiles set owl_energy = 5, owl_energy_at = now() where id = c_uid;

  -- 6단계 도달 + owl_energy_found → 지급
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '200 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 4000,
    '{"stage":6,"cleared":false,"bosses":1,"duration_s":198,"kills":350,"level":14,"evolutions":1,
      "obstacles":6,"damage_taken":3,"revives_used":0,"theme":"dark","owl_energy_found":true}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('거부됨: %s', v_r);
  assert (v_r ->> 'owl_energy_gained')::int = 1, format('드랍이 지급돼야 함: %s', v_r);

  -- 5단계(첫 보스 전)에서 끝나면 지급 안 함
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'survive', now() - interval '160 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 3000,
    '{"stage":5,"cleared":false,"bosses":0,"duration_s":158,"kills":350,"level":14,"evolutions":1,
      "obstacles":6,"damage_taken":3,"revives_used":0,"theme":"dark","owl_energy_found":true}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('거부됨: %s', v_r);
  assert (v_r ->> 'owl_energy_gained')::int = 0, format('첫 보스 전이면 미지급: %s', v_r);

  raise notice '✅ 6. 아울 에너지 드랍 — 6단계 이상 도달에서만';
end $$;

rollback;
