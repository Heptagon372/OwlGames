-- =====================================================================
-- OWL GAMES — 아울리스 서버 검증 · 피싱 헌터/아울스페이스 종료
--   대상: 20261002000000_owlis.sql
--   명세: OWLIS_GDD.md §24~§26 · games/owlis/engine/score.ts (serverRaw · serverReject 와 같은 식)
--
--   실행: psql "<connection-string>" -f supabase/tests/owlis.sql
--   결과: 오류 없이 끝나면 통과 (섹션마다 NOTICE 로 요약 출력)
--
--   주의: 전부 트랜잭션 안에서 돌고 마지막에 rollback 한다.
-- =====================================================================

begin;
set local plpgsql.check_asserts = on;

-- ===== 0. 테스트 유저 ================================================
do $$
declare
  c_ok     constant uuid := '0aa10715-0000-4000-8000-000000000001';
  c_bad    constant uuid := '0aa10715-0000-4000-8000-000000000002';
  c_old    constant uuid := '0aa10715-0000-4000-8000-000000000003';
  c_energy constant uuid := '0aa10715-0000-4000-8000-000000000004';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (c_ok,     '999710001@owlgames.local', jsonb_build_object('name', '아울정상', 'student_id', '999710001')),
    (c_bad,    '999710002@owlgames.local', jsonb_build_object('name', '아울거부', 'student_id', '999710002')),
    (c_old,    '999710003@owlgames.local', jsonb_build_object('name', '아울예전', 'student_id', '999710003')),
    (c_energy, '999710004@owlgames.local', jsonb_build_object('name', '아울에너지', 'student_id', '999710004'));

  update public.profiles set verified = true
   where id in (c_ok, c_bad, c_old, c_energy);

  raise notice '테스트 유저 4명 준비 완료';
end $$;


-- ===== 1. 설정 =======================================================
do $$
declare
  v_k     jsonb := public.cfg('game_k');
  v_lim   jsonb := public.cfg('game_limits');
  v_guard jsonb := public.cfg('game_guards');
begin
  assert (v_k ->> 'owlis')::numeric = 40,                         format('owlis K 40: %s', v_k);
  assert (v_lim -> 'owlis' ->> 'min_sec')::numeric = 10,          format('owlis min_sec 10: %s', v_lim);
  assert (v_lim -> 'owlis' ->> 'max_sec')::numeric = 1800,        format('owlis max_sec 1800: %s', v_lim);
  assert (v_guard -> 'owlis' ->> 'level_per_sec')::numeric = 0.037, format('guards: %s', v_guard);
  assert (v_guard -> 'owlis' ->> 'ko_bump')::numeric = 0.25,       format('guards: %s', v_guard);
  -- 다른 게임 설정은 그대로 (K값 저장 검증이 phish 키를 요구한다)
  assert (v_k ->> 'phish') is not null, 'phish K 키는 남아 있어야 함';
  assert (v_guard -> 'survive') is not null, 'survive guards 는 그대로';

  raise notice '✅ 1. 설정 (K 40 · 10~1800초 · guards)';
end $$;


-- ===== 2. 정상 제출 + 원점수 재계산 + 개인 기록 =======================
do $$
declare
  c_uid constant uuid := '0aa10715-0000-4000-8000-000000000001';
  -- 200초 · 블록 150 · 터뜨림 180 · 연쇄 30회(최대 4) · COUNTER 2 · EMERGENCY 1 · KO 1 · LEVEL 3.2 · 블록 점수 5,000
  --   상한 = (180×10×2.0 + 30×40×16) × (1.5×1.5) = 51,300 → 5,000 그대로
  --   raw  = 5,000 + 2×500 + 1×300 + 1×1,500 + 생존(60초 100 + 180초 500) = 8,400
  c_meta constant jsonb := '{"duration_s":200,"pieces":150,"cleared":180,"garbage_cleared":12,"chains":30,
                             "max_combo":4,"avg_combo":1.6,"attack_sent":40,"attack_received":22,"counters":2,
                             "emergencies":1,"ko":1,"fevers":1,"level_max":3.2,"level_label":"3",
                             "clear_score":5000,"end":"topout","owl_energy_found":false,"device":"mobile","v":"1.0.0"}'::jsonb;
  v_sid uuid;
  v_r   jsonb;
  v_rec jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'owlis', now() - interval '205 seconds')
  returning id into v_sid;

  v_r := public.submit_game_session(v_sid, 8400, c_meta);

  assert v_r ->> 'status' = 'ok', format('정상 제출인데 %s', v_r);
  assert (v_r ->> 'raw_score')::int = 8400, format('raw 유지 안 됨: %s', v_r ->> 'raw_score');
  -- points = 30 + min(270, floor(8400/40)) = 30 + 210 = 240
  assert (v_r ->> 'points')::int = 240, format('points 240 (실제 %s)', v_r ->> 'points');
  assert v_r ? 'unlocked_stage', format('unlocked_stage 키는 모든 게임 공통: %s', v_r);

  select meta -> 'owlis_record' into v_rec from public.profiles where id = c_uid;
  assert (v_rec ->> 'best')::int = 8400,    format('기록 best: %s', v_rec);
  assert (v_rec ->> 'sec')::int = 200,      format('기록 sec: %s', v_rec);
  assert (v_rec ->> 'combo')::int = 4,      format('기록 combo: %s', v_rec);
  assert (v_rec ->> 'level')::numeric = 3.2, format('기록 level: %s', v_rec);
  assert (v_rec ->> 'games')::int = 1,      format('기록 games: %s', v_rec);

  -- 두 번째 판은 더 못했다 — 최고치는 그대로, 플레이 수만 +1
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'owlis', now() - interval '70 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 700,
    '{"duration_s":65,"pieces":40,"cleared":40,"chains":8,"max_combo":2,"counters":0,"emergencies":0,
      "ko":0,"fevers":0,"level_max":2.1,"clear_score":600,"end":"topout"}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('두 번째 판: %s', v_r);
  select meta -> 'owlis_record' into v_rec from public.profiles where id = c_uid;
  assert (v_rec ->> 'best')::int = 8400 and (v_rec ->> 'games')::int = 2, format('최고치 유지 + 판 수: %s', v_rec);

  raise notice '✅ 2. 정상 제출 — raw 8,400 / 240P · owlis_record 최고치만 갱신';
end $$;


-- ===== 3. 거부 규칙 ==================================================
do $$
declare
  c_uid constant uuid := '0aa10715-0000-4000-8000-000000000002';
  c_base constant jsonb := '{"duration_s":98,"pieces":60,"cleared":80,"chains":10,"max_combo":3,"counters":0,
                             "emergencies":0,"ko":0,"fevers":0,"level_max":2,"clear_score":1500,"end":"topout"}'::jsonb;
  v_sid uuid;
  v_r   jsonb;
  v_case record;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  for v_case in
    select * from (values
      ('{"pieces":900}'::jsonb,                          '블록을 놓은 속도%'),   -- 100초에 900개
      ('{"cleared":150}'::jsonb,                         '터뜨린 블록이%'),       -- 60개 × 2 = 120 < 150
      ('{"max_combo":25}'::jsonb,                        '연쇄 기록%'),           -- 한계 19 초과
      ('{"max_combo":8,"cleared":30,"chains":2}'::jsonb, '연쇄 기록%'),           -- 8연쇄에 30칸은 불가능
      ('{"chains":30}'::jsonb,                           '연쇄 횟수%'),           -- 30×4 > 80
      ('{"level_max":6}'::jsonb,                         'AI LEVEL%'),            -- 100초면 최대 ≈ 4.75
      ('{"ko":9}'::jsonb,                                'KO 수%'),               -- 20초당 1
      ('{"counters":11}'::jsonb,                         '보너스 기록%'),         -- 연쇄 10회
      ('{"duration_s":180}'::jsonb,                      '플레이 시간%'),         -- 서버 100초
      ('{"pieces":-1}'::jsonb,                           '기록 값%')
    ) as t(patch, reason)
  loop
    insert into public.game_sessions (user_id, game, started_at)
    values (c_uid, 'owlis', now() - interval '100 seconds') returning id into v_sid;
    v_r := public.submit_game_session(v_sid, 1500, c_base || v_case.patch);
    assert v_r ->> 'status' = 'rejected', format('%s 인데 %s', v_case.patch, v_r);
    assert v_r ->> 'reason' like v_case.reason, format('%s 사유가 다름: %s', v_case.patch, v_r ->> 'reason');
    assert (v_r ->> 'points')::int = 0, format('거부면 0P: %s', v_r);
  end loop;

  raise notice '✅ 3. 거부 규칙 10종 (블록속도/터뜨린수/연쇄한계/연쇄칸수/연쇄횟수/난이도속도/KO/보너스/시간위조/음수)';
end $$;


-- ===== 4. 블록 점수 뻥튀기 → 상한 클램프 + 서버값 채택 ================
do $$
declare
  c_uid constant uuid := '0aa10715-0000-4000-8000-000000000002';
  v_sid uuid;
  v_r   jsonb;
  v_m   jsonb;
  -- 터뜨림 20 · 연쇄 2회(최대 2) · LEVEL 1.5 → 상한 (20×10×1.2 + 2×40×4) × (1.0×1.5) = 840
  -- raw = 840 + 생존(62초 → 100) = 940
  v_exp int := 940;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'owlis', now() - interval '64 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 999999,
    '{"duration_s":62,"pieces":30,"cleared":20,"chains":2,"max_combo":2,"counters":0,"emergencies":0,
      "ko":0,"fevers":0,"level_max":1.5,"clear_score":999000,"end":"topout"}'::jsonb);

  assert v_r ->> 'status' = 'ok', format('뻥튀기는 거부가 아니라 보정: %s', v_r);
  assert (v_r ->> 'raw_score')::int = v_exp, format('서버 재계산값 %s (실제 %s)', v_exp, v_r ->> 'raw_score');
  select meta into v_m from public.game_sessions where id = v_sid;
  assert (v_m -> 'raw_adjusted') = to_jsonb(true), format('raw_adjusted 없음: %s', v_m);

  raise notice '✅ 4. 블록 점수 뻥튀기 → 상한 840 + 생존 100 = 940 으로 보정';
end $$;


-- ===== 5. 피싱 헌터 · 아울스페이스 종료 ===============================
do $$
declare
  c_uid constant uuid := '0aa10715-0000-4000-8000-000000000003';
  v_sid uuid;
  v_r   jsonb;
  v_ok  boolean;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);

  -- 새로 시작할 수 없다
  for v_r in select to_jsonb(g) from unnest(array['phish', 'space']) g loop
    v_ok := false;
    begin
      perform public.start_game_session((v_r #>> '{}')::public.game_id);
    exception when others then
      v_ok := sqlerrm like '%플레이할 수 없는%';
    end;
    assert v_ok, format('%s 는 시작이 막혀야 함', v_r);
  end loop;

  -- 배포 순간 열려 있던 세션이 늦게 들어와도 0P
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'phish', now() - interval '60 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 1500, '{"answered":20,"correct":12,"wrong":8,"max_streak":5}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('phish 세션은 rejected: %s', v_r);

  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'space', now() - interval '90 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 3000, '{"stage":1,"kills":40,"graze":10,"lives_left":1}'::jsonb);
  assert v_r ->> 'status' = 'rejected', format('space 세션은 rejected: %s', v_r);

  raise notice '✅ 5. phish · space — 시작 차단 + 늦은 제출 rejected';
end $$;


-- ===== 6. 아울 에너지 드랍 (AI LEVEL 3 이상) =========================
do $$
declare
  c_uid constant uuid := '0aa10715-0000-4000-8000-000000000004';
  v_sid uuid;
  v_r   jsonb;
begin
  perform set_config('request.jwt.claim.sub', c_uid::text, true);
  update public.profiles set owl_energy = 5, owl_energy_at = now() where id = c_uid;

  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'owlis', now() - interval '150 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 3000,
    '{"duration_s":148,"pieces":90,"cleared":120,"chains":20,"max_combo":3,"counters":0,"emergencies":0,
      "ko":0,"fevers":0,"level_max":3.4,"clear_score":2900,"end":"topout","owl_energy_found":true}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('거부됨: %s', v_r);
  assert (v_r ->> 'owl_energy_gained')::int = 1, format('LEVEL 3.4 면 지급: %s', v_r);

  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'owlis', now() - interval '90 seconds') returning id into v_sid;
  v_r := public.submit_game_session(v_sid, 1200,
    '{"duration_s":88,"pieces":50,"cleared":60,"chains":10,"max_combo":2,"counters":0,"emergencies":0,
      "ko":0,"fevers":0,"level_max":2.6,"clear_score":1100,"end":"topout","owl_energy_found":true}'::jsonb);
  assert v_r ->> 'status' = 'ok', format('거부됨: %s', v_r);
  assert (v_r ->> 'owl_energy_gained')::int = 0, format('LEVEL 3 미만이면 미지급: %s', v_r);

  raise notice '✅ 6. 아울 에너지 드랍 — AI LEVEL 3 이상에서만';
end $$;

do $$
begin
  raise notice '🎉 owlis: 설정 · 정상제출/기록 · 거부 10종 · 뻥튀기 보정 · 종료 게임 차단 · 에너지 드랍 모두 통과';
end $$;

rollback;
