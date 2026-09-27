-- =====================================================================
-- OWL GAMES — 아울 레스토랑 서버 헬퍼
--   대상: 20261005000000_chef.sql
--   명세: OWLRESTAURANT_GDD.md §29 · §32 · games/chef/engine/score.ts (serverRaw · serverReject 와 같은 식)
--
--   실행: psql "<connection-string>" -f supabase/tests/chef.sql
--   결과: 오류 없이 끝나면 통과 (섹션마다 NOTICE 로 요약 출력)
--   주의: 전부 트랜잭션 안에서 돌고 마지막에 rollback 한다.
-- =====================================================================

begin;
set local plpgsql.check_asserts = on;

-- ===== 1. 설정 =======================================================
do $$
begin
  assert (public.cfg('game_k') ->> 'chef')::numeric = 200, 'chef K 200';
  assert (public.cfg('game_limits') -> 'chef' ->> 'max_sec')::numeric = 1210, 'chef max_sec 1210';
  assert (public.cfg('game_guards') -> 'chef' ->> 'min_sec_per_plate')::numeric = 1.2, 'chef guard';
  assert (public.cfg('game_guards') -> 'owlis') is not null, '다른 게임 guards 는 그대로';
  raise notice '✅ 1. 설정 (K 200 · 15~1210초 · guards)';
end $$;

-- ===== 2. 단계 — 주문 누계 2·4·…·18·21·…·63 (25단계), ∞ 는 67 + 코스 =====
do $$
begin
  assert public.chef_stage(0, 0) = 1, 'stage 0';
  assert public.chef_stage(1, 0) = 1, 'stage 1';
  assert public.chef_stage(2, 0) = 2, 'stage 2';
  assert public.chef_stage(6, 0) = 4, 'stage 4';
  assert public.chef_stage(63, 0) = 25, 'stage 25';
  assert public.chef_stage(90, 0) = 25, '코스 없이는 ∞ 가 아니다';
  assert public.chef_stage(67, 1) = 26, '∞';
  raise notice '✅ 2. chef_stage';
end $$;

-- ===== 3. 원점수 재계산 · 거부 =======================================
do $$
declare
  -- 5단계 도달 (주문 9 · 접시 10), 요리 점수가 상한 안이다
  v_ok jsonb := '{"duration_s":180,"served_total":10,"served_by_star":[8,2,0,0,0],"orders":9,"courses":0,
                  "max_combo":6,"perfects":5,"hotfixes":1,"clean_builds":0,"clean_orders":0,
                  "stage_max":4,"inf_level":0,"dish_score":1500,"bonus_score":300}'::jsonb;
  v_raw numeric;
begin
  v_ok := jsonb_set(v_ok, '{stage_max}', to_jsonb(public.chef_stage(9, 0)));
  assert public.chef_reject_reason(v_ok, 185) is null, format('정상 판이 거부됨: %s', public.chef_reject_reason(v_ok, 185));
  v_raw := public.chef_raw(v_ok);
  -- 1500 + 300 + STAGE CLEAR(1+2+3+4)×100
  assert v_raw = 1500 + 300 + 1000, format('raw %s', v_raw);

  -- 요리 점수 부풀리기 → 상한으로 깎인다
  assert public.chef_raw(jsonb_set(v_ok, '{dish_score}', '999999')) < 10000, '요리 점수 상한';
  -- 단계 조작 · 속도 · 접시 수 불일치
  assert public.chef_reject_reason(jsonb_set(v_ok, '{stage_max}', '9'), 185) is not null, '단계 조작';
  assert public.chef_reject_reason(v_ok, 5) is not null, '너무 빠름';
  assert public.chef_reject_reason(jsonb_set(v_ok, '{served_total}', '11'), 185) is not null, '접시 수 불일치';
  assert public.chef_reject_reason(jsonb_set(v_ok, '{inf_level}', '2'), 185) is not null, '∞ 전인데 LV';
  raise notice '✅ 3. chef_raw · chef_reject_reason';
end $$;

rollback;
