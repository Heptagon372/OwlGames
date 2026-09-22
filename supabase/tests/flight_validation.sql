-- =====================================================================
-- OWL GAMES — 아울러닝(flight) 서버 검증 / 원점수 재계산 테스트
--   대상: 20260924000000_owlrunning.sql 의 submit_game_session
--   명세: OWLRUNNING_GDD.md §11.1 / §11.2 / §11.3, §16 수용기준 7
--
--   실행: psql "<connection-string>" -f supabase/tests/flight_validation.sql
--         또는 Supabase SQL 편집기에 전체 붙여넣기
--   결과: 오류 없이 끝나면 통과 (마지막에 NOTICE 로 요약 출력)
--
--   주의
--   · 전부 트랜잭션 안에서 돌고 마지막에 rollback 한다. 영구 변경 없음.
--     (테스트 유저 1명을 auth.users 에 잠깐 만들었다가 되돌린다)
--   · auth.uid() 를 흉내내려고 request.jwt.claim.sub 를 set_config(..., true) 로 잡는다.
--     세 번째 인자 true = 트랜잭션 로컬.
--   · start_game_session() 은 운영시간 검사가 있어서 새벽에 돌리면 실패한다.
--     여기서는 검증 대상이 submit 이므로 game_sessions 에 직접 세션을 만든다.
-- =====================================================================

begin;
set local plpgsql.check_asserts = on;

-- 설정은 일부러 "고쳐주지 않는다". K_flight=20 / flight 3~185초는 마이그레이션이
-- 보장해야 하는 값이라, 틀려 있으면 아래 0번 단계에서 바로 터지는 게 맞다.

do $$
declare
  c_uid      constant uuid := '0ff1f117-0000-4000-8000-000000000001';
  c_sid      constant text := '999000001';

  -- GDD §11.3 예시 메타 (정직한 플레이)
  --   raw = 1284 + 61×10×1.8 + 14×25×1.8 + 640 + 1×200 + 38×2
  --       = 1284 + 1098 + 630 + 640 + 200 + 76 = 3928
  c_meta_ok  constant jsonb := '{"distance_m":1284,"duration_s":92.4,"pass_count":61,
                                 "near_miss":14,"combo_max":27,"combo_mult_avg":1.8,
                                 "items":23,"item_score":640,"energy_left":38,
                                 "phase_max":3,"special_cleared":1,
                                 "size_end":"M","build":"1.0.0","client_elapsed_sec":92}'::jsonb;
  c_raw_srv  constant numeric := 3928;

  v_k        numeric;
  v_limits   jsonb;
  v_sid      uuid;
  v_r        jsonb;
  v_row      public.game_sessions%rowtype;
  v_case     jsonb;
  v_cases    jsonb;
  v_expect   int;
begin
  -- ===== 0. 설정 확인 (§11.2) =========================================
  v_k := (public.cfg('game_k') ->> 'flight')::numeric;
  assert v_k = 20, format('K_flight 는 20 이어야 함 (실제 %s)', v_k);
  assert (public.cfg('game_k') ->> 'typer')::numeric = 4,  'typer K 가 바뀌면 안 됨';
  assert (public.cfg('game_k') ->> 'phish')::numeric = 10, 'phish K 가 바뀌면 안 됨';

  v_limits := public.cfg('game_limits') -> 'flight';
  assert (v_limits ->> 'min_sec')::numeric = 3,
         format('flight min_sec 는 3 이어야 함 (실제 %s)', v_limits ->> 'min_sec');
  assert (v_limits ->> 'max_sec')::numeric = 185,
         format('flight max_sec 는 185 이어야 함 (실제 %s)', v_limits ->> 'max_sec');

  -- ===== 0.1 테스트 유저 =============================================
  insert into auth.users (id, email, raw_user_meta_data)
  values (c_uid, c_sid || '@owlgames.local',
          jsonb_build_object('name', '테스트부엉이', 'student_id', c_sid));
  update public.profiles set verified = true where id = c_uid;

  perform set_config('request.jwt.claim.sub', c_uid::text, true);
  assert auth.uid() = c_uid, 'auth.uid() 스텁이 동작하지 않음';

  -- ===== 1. 정상 제출 — 클라이언트 점수가 ±5% 안이면 그대로 쓴다 ======
  --   서버 재계산 3928, 클라이언트 4000 → 차이 72 ≤ 196.4 (5%) → 4000 채택
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'flight', now() - interval '92 seconds')
  returning id into v_sid;

  v_r := public.submit_game_session(v_sid, 4000, c_meta_ok);

  assert v_r ->> 'status' = 'ok', format('정상 제출인데 %s', v_r);
  assert (v_r ->> 'raw_score')::int = 4000,
         format('클라이언트 점수를 유지해야 함 (실제 %s)', v_r ->> 'raw_score');
  v_expect := 30 + least(270, floor(4000::numeric / 20))::int;   -- = 230
  assert v_expect = 230, format('기대 포인트 계산이 틀림: %s', v_expect);
  assert (v_r ->> 'points')::int = v_expect,
         format('포인트는 30+min(270,floor(raw/20)) = %s 여야 함 (실제 %s)', v_expect, v_r ->> 'points');

  select * into v_row from public.game_sessions where id = v_sid;
  assert v_row.status = 'submitted', format('세션 상태 %s', v_row.status);
  assert v_row.raw_score = 4000, format('저장된 raw_score %s', v_row.raw_score);
  assert v_row.points = 230, format('저장된 points %s', v_row.points);
  assert not jsonb_exists(v_row.meta, 'raw_adjusted'),
         format('오차 5퍼센트 안이면 raw_adjusted 를 남기면 안 됨: %s', v_row.meta);
  assert (v_row.meta ->> 'elapsed_sec')::numeric between 90 and 95,
         format('elapsed_sec 기록 이상: %s', v_row.meta ->> 'elapsed_sec');

  -- 레이트리밋(직전 제출 간격 < min_sec) 때문에 다음 케이스가 막히지 않도록 뒤로 민다
  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';

  -- ===== 2. 거부 케이스 (§11.3) ======================================
  v_cases := jsonb_build_array(
    -- (a) 거리 뻥튀기: 92초 × 24m/s × 1.02 = 2252m 가 상한인데 9000m 를 주장
    jsonb_build_object(
      'name',    '거리 뻥튀기',
      'elapsed', 92, 'raw', 12000,
      'reason',  '거리가 물리적으로 불가능해요',
      'meta',    c_meta_ok || '{"distance_m":9000}'::jsonb),
    -- (b) distance_m 누락 = 검증 불가 → 같은 사유로 거부
    jsonb_build_object(
      'name',    'distance_m 누락',
      'elapsed', 92, 'raw', 3928,
      'reason',  '거리가 물리적으로 불가능해요',
      'meta',    (c_meta_ok - 'distance_m')),
    -- (c) 8m 에 1개 규칙 위반: 800m 면 통과 100회가 상한인데 200회
    jsonb_build_object(
      'name',    '통과 횟수 초과',
      'elapsed', 92, 'raw', 5000,
      'reason',  '통과 횟수가 거리에 비해 너무 많아요',
      'meta',    c_meta_ok || '{"distance_m":800,"pass_count":200,"near_miss":10}'::jsonb),
    -- (d) 니어미스 > 통과
    jsonb_build_object(
      'name',    '니어미스 > 통과',
      'elapsed', 92, 'raw', 5000,
      'reason',  '니어미스 수가 통과 횟수보다 많아요',
      'meta',    c_meta_ok || '{"near_miss":62}'::jsonb),
    -- (e) 서버 경과 20초인데 92.4초를 플레이했다고 주장 (거리는 20초 상한 이하로 맞춰 둠)
    jsonb_build_object(
      'name',    '클라이언트 시간 위조',
      'elapsed', 20, 'raw', 900,
      'reason',  '플레이 시간이 서버 기록과 맞지 않아요',
      'meta',    c_meta_ok || '{"distance_m":300,"pass_count":20,"near_miss":5}'::jsonb)
  );

  for v_case in select * from jsonb_array_elements(v_cases) loop
    insert into public.game_sessions (user_id, game, started_at)
    values (c_uid, 'flight',
            now() - make_interval(secs => (v_case ->> 'elapsed')::double precision))
    returning id into v_sid;

    v_r := public.submit_game_session(v_sid, (v_case ->> 'raw')::int, v_case -> 'meta');

    assert v_r ->> 'status' = 'rejected',
           format('[%s] rejected 여야 하는데 %s', v_case ->> 'name', v_r);
    assert v_r ->> 'reason' = v_case ->> 'reason',
           format('[%s] 거부 사유가 "%s" (기대 "%s")',
                  v_case ->> 'name', v_r ->> 'reason', v_case ->> 'reason');
    assert (v_r ->> 'points')::int = 0,
           format('[%s] 거부 시 포인트는 0 (실제 %s)', v_case ->> 'name', v_r ->> 'points');

    select * into v_row from public.game_sessions where id = v_sid;
    assert v_row.status = 'rejected',
           format('[%s] 세션이 rejected 로 남아야 함 (실제 %s)', v_case ->> 'name', v_row.status);
    assert v_row.points = 0,
           format('[%s] 저장된 points %s', v_case ->> 'name', v_row.points);
    assert v_row.meta ->> 'reject_reason' = v_case ->> 'reason',
           format('[%s] meta.reject_reason 누락: %s', v_case ->> 'name', v_row.meta);
    assert not jsonb_exists(v_row.meta, 'raw_adjusted'),
           format('[%s] 거부된 세션에 raw_adjusted 가 붙으면 안 됨', v_case ->> 'name');
  end loop;

  -- 거부는 랭킹/포인트에 아무 영향이 없어야 한다
  assert (select total_points from public.profiles where id = c_uid) = 230,
         format('거부 케이스가 포인트를 건드림: %s',
                (select total_points from public.profiles where id = c_uid));

  -- ===== 3. 정직한 메타 + 3배 뻥튀기 점수 → 거부가 아니라 "하향 보정" ==
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'flight', now() - interval '92 seconds')
  returning id into v_sid;

  v_r := public.submit_game_session(v_sid, (c_raw_srv * 3)::int, c_meta_ok);

  assert v_r ->> 'status' = 'ok',
         format('메타가 정상이면 거부가 아니라 보정이어야 함: %s', v_r);
  assert (v_r ->> 'raw_score')::int = c_raw_srv::int,
         format('서버 재계산 값 %s 를 써야 함 (실제 %s)', c_raw_srv, v_r ->> 'raw_score');
  v_expect := 30 + least(270, floor(c_raw_srv / 20))::int;   -- 30 + 196 = 226
  assert v_expect = 226, format('기대 포인트 계산이 틀림: %s', v_expect);
  assert (v_r ->> 'points')::int = v_expect,
         format('보정 후 포인트는 %s 여야 함 (실제 %s)', v_expect, v_r ->> 'points');

  select * into v_row from public.game_sessions where id = v_sid;
  assert v_row.raw_score = c_raw_srv::int, format('저장된 raw_score %s', v_row.raw_score);
  assert (v_row.meta ->> 'raw_adjusted')::boolean,
         format('meta.raw_adjusted 가 true 여야 함: %s', v_row.meta);
  assert (v_row.meta ->> 'raw_client')::numeric = c_raw_srv * 3,
         format('meta.raw_client %s', v_row.meta ->> 'raw_client');
  assert (v_row.meta ->> 'raw_server')::numeric = c_raw_srv,
         format('meta.raw_server %s (기대 %s)', v_row.meta ->> 'raw_server', c_raw_srv);

  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';

  -- ===== 3.1 경계: 정확히 5% 차이는 "허용" (> 만 보정) ================
  --   3928 × 1.05 = 4124.4 → 4124 는 차이 196 ≤ 196.4 → 그대로
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'flight', now() - interval '92 seconds')
  returning id into v_sid;

  v_r := public.submit_game_session(v_sid, 4124, c_meta_ok);
  assert (v_r ->> 'raw_score')::int = 4124,
         format('5%% 경계 안쪽은 클라이언트 값 유지 (실제 %s)', v_r ->> 'raw_score');

  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';

  -- ===== 3.2 메타 필드를 부풀려 상한을 사려는 시도는 클램프된다 ======
  --   combo_mult_avg 99 → 2.5 / energy_left 9999 → 130 / special_cleared 99 → 10
  --   items=0 이므로 item_score 상한은 300 (999999 → 300)
  --   raw_server = 120 + 10×10×2.5 + 4×25×2.5 + 300 + 10×200 + 130×2
  --              = 120 + 250 + 250 + 300 + 2000 + 260 = 3180 → 30 + floor(3180/20) = 189P
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'flight', now() - interval '30 seconds')
  returning id into v_sid;

  v_r := public.submit_game_session(v_sid, 999999,
    '{"distance_m":120,"duration_s":29.5,"pass_count":10,"near_miss":4,
      "combo_mult_avg":99,"items":0,"item_score":999999,"energy_left":9999,
      "special_cleared":99,"size_end":"M","build":"1.0.0"}'::jsonb);

  assert v_r ->> 'status' = 'ok', format('클램프 케이스: %s', v_r);
  assert (v_r ->> 'raw_score')::int = 3180,
         format('클램프 후 raw 는 3180 이어야 함 (실제 %s)', v_r ->> 'raw_score');
  assert (v_r ->> 'points')::int = 189,
         format('클램프 후 포인트는 189 이어야 함 (실제 %s)', v_r ->> 'points');

  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';

  -- ===== 3.3 특수구간 완주 = 정상 플레이. 하향 보정되면 안 된다 =======
  --   GDD §10 배율(TURBO 거리 ×2 등)로 더 번 점수를 클라이언트가 special_bonus_score 로 보낸다.
  --   이 항이 없으면 raw_server 가 3928 이라 클라 4228 은 7.6% 차이 → 억울하게 깎였다.
  --   이제 raw_server = 3928 + 300 = 4228 → 차이 0 → 그대로. 30 + floor(4228/20) = 241P
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'flight', now() - interval '92 seconds')
  returning id into v_sid;

  v_r := public.submit_game_session(v_sid, 4228,
    c_meta_ok || '{"special_cleared":1,"special_bonus_score":300}'::jsonb);

  assert v_r ->> 'status' = 'ok', format('특수구간 완주 케이스: %s', v_r);
  assert (v_r ->> 'raw_score')::int = 4228,
         format('특수구간 보너스가 반영되어 클라 점수를 유지해야 함 (실제 %s)', v_r ->> 'raw_score');
  assert (v_r ->> 'points')::int = 241,
         format('특수구간 완주 포인트는 241 이어야 함 (실제 %s)', v_r ->> 'points');
  select * into v_row from public.game_sessions where id = v_sid;
  assert not jsonb_exists(v_row.meta, 'raw_adjusted'),
         format('특수구간 완주가 하향 보정됨: %s', v_row.meta);

  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';

  -- ===== 3.4 special_bonus_score 로 점수를 사려는 시도는 클램프된다 ===
  --   상한 = 800 × (special_cleared + 1). special_cleared=0 이면 800 (진행 중 구간 몫).
  --   raw_server = 1284 + 1098 + 630 + 640 + 0×200 + 76 + 800 = 4528
  --              → 30 + floor(4528/20) = 30 + 226 = 256P
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'flight', now() - interval '92 seconds')
  returning id into v_sid;

  v_r := public.submit_game_session(v_sid, 99999,
    c_meta_ok || '{"special_cleared":0,"special_bonus_score":99999}'::jsonb);

  assert v_r ->> 'status' = 'ok', format('보너스 클램프 케이스: %s', v_r);
  assert (v_r ->> 'raw_score')::int = 4528,
         format('special_bonus 는 800 으로 잘려야 함 → raw 4528 (실제 %s)', v_r ->> 'raw_score');
  assert (v_r ->> 'points')::int = 256,
         format('보너스 클램프 후 포인트는 256 이어야 함 (실제 %s)', v_r ->> 'points');
  select * into v_row from public.game_sessions where id = v_sid;
  assert (v_row.meta ->> 'raw_adjusted')::boolean,
         format('클램프됐으면 raw_adjusted 가 남아야 함: %s', v_row.meta);

  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';

  -- ===== 4. typer / phish 는 새 로직의 영향을 받지 않는다 =============
  --   flight 규칙을 정면으로 위반하는 메타(거리 99999, 니어미스 > 통과)를 붙여도
  --   flight 가 아니면 검사도, 재계산도 하지 않는다.
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'typer', now() - interval '40 seconds')
  returning id into v_sid;

  v_r := public.submit_game_session(v_sid, 2000,
    '{"distance_m":99999,"pass_count":9999,"near_miss":99999,
      "item_score":999999,"chars":410,"combo_max":12}'::jsonb);

  assert v_r ->> 'status' = 'ok', format('typer 가 거부됨: %s', v_r);
  assert (v_r ->> 'raw_score')::int = 2000,
         format('typer raw_score 가 바뀜: %s', v_r ->> 'raw_score');
  assert (v_r ->> 'points')::int = 30 + least(270, floor(2000::numeric / 4))::int,  -- 상한 300
         format('typer 포인트 %s (기대 300)', v_r ->> 'points');
  select * into v_row from public.game_sessions where id = v_sid;
  assert not jsonb_exists(v_row.meta, 'raw_adjusted'), 'typer 에 raw_adjusted 가 붙음';

  update public.game_sessions set submitted_at = now() - interval '1 hour'
   where user_id = c_uid and status = 'submitted';

  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'phish', now() - interval '60 seconds')
  returning id into v_sid;

  v_r := public.submit_game_session(v_sid, 1500,
    '{"distance_m":-1,"near_miss":500,"pass_count":0,"correct":12,"streak_max":7}'::jsonb);

  assert v_r ->> 'status' = 'ok', format('phish 가 거부됨: %s', v_r);
  assert (v_r ->> 'raw_score')::int = 1500,
         format('phish raw_score 가 바뀜: %s', v_r ->> 'raw_score');
  assert (v_r ->> 'points')::int = 30 + least(270, floor(1500::numeric / 10))::int,  -- 180
         format('phish 포인트 %s (기대 180)', v_r ->> 'points');
  select * into v_row from public.game_sessions where id = v_sid;
  assert not jsonb_exists(v_row.meta, 'raw_adjusted'), 'phish 에 raw_adjusted 가 붙음';

  -- ===== 5. 제네릭 검증은 flight 규칙보다 먼저다 =====================
  --   185초를 넘긴 세션은 flight 사유가 아니라 기존 사유로 거부되어야 한다.
  insert into public.game_sessions (user_id, game, started_at)
  values (c_uid, 'flight', now() - interval '200 seconds')
  returning id into v_sid;

  v_r := public.submit_game_session(v_sid, 12000, c_meta_ok || '{"distance_m":9000}'::jsonb);
  assert v_r ->> 'reason' = '플레이 시간이 초과됐어요',
         format('제네릭 사유가 우선이어야 함 (실제 %s)', v_r ->> 'reason');

  raise notice '✅ flight_validation: 정상 제출 / 거리·통과·니어미스·시간 위조 거부 / 3배 점수 하향 보정 / 필드·특수구간 보너스 클램프 / 특수구간 완주 보존 / typer·phish 무영향 모두 통과';
end $$;

rollback;
