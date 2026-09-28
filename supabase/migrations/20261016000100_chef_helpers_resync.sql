-- ===================================================================
-- 아울 레스토랑 채점 헬퍼 다시 맞추기 (DECISIONS §5-44)
-- ===================================================================
-- 증상: 5단계를 넘긴 판이 전부 "도달 단계가 주문 수와 맞지 않아요"로 거부돼 기록·포인트가 안 남았다.
-- 원인: 20261005000000_chef.sql 을 db push 한 **뒤에** 그 파일의 단계 누계를 고쳤다
--       (1~9단계 주문 3개 → 2개, ∞ = 26). 이미 적용된 마이그레이션은 다시 돌지 않으므로 운영 DB 에는
--       옛 chef_stage(2,4,6,9,12,…)가 남아 있었고, 클라이언트(games/chef/config.ts 의 STAGES)는 새 누계로
--       stage_max 를 보냈다 — 예) 주문 14개: 클라이언트 8단계 · 서버 6단계.
-- 조치: chef_* 헬퍼 다섯 개를 20261005 의 현재 본문 그대로 다시 만든다.
--       submit_game_session_core 는 헬퍼를 이름으로 부르므로 다시 만들 필요가 없다.
--       tests/chef-engine.test.ts 가 이 파일의 식을 TS(stageOf · serverReject · serverRaw)와 대조한다.
-- ===================================================================

-- 2.1 끝낸 주문 수 → 도달 단계 (26 = ∞). games/chef/config.ts 의 STAGES[].orders 누계와 같다 (25단계).
--     25단계의 마지막 주문은 풀스택 코스요리라서 ∞ 는 "주문 67 이상 + 코스 1회 이상" 일 때만이다.
create or replace function public.chef_stage(p_orders numeric, p_courses numeric)
returns int
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when coalesce(p_orders, 0) >= 67 and coalesce(p_courses, 0) >= 1 then 26
    else 1 + (select count(*)::int from unnest(array[2, 4, 6, 8, 10, 12, 14, 16, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63]) t
               where t <= coalesce(p_orders, 0))
  end;
$$;

-- 2.2 점수 단계 배율 (∞ 는 15단계 값)
create or replace function public.chef_mult(p_stage int)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select sqrt(power(1.16::numeric, least(greatest(p_stage, 1), 25) - 1));
$$;

-- 2.3 별(1~5)별 접시 수 — 배열이 아니거나 값이 이상하면 0
create or replace function public.chef_star(p_meta jsonb, p_k int)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when jsonb_typeof(p_meta -> 'served_by_star') = 'array'
     and jsonb_typeof(p_meta -> 'served_by_star' -> p_k) = 'number'
    then (p_meta -> 'served_by_star' ->> p_k)::numeric
    else 0
  end;
$$;

-- 2.4 거부 사유 (없으면 null). 시간은 서버 기준(p_elapsed)만 믿는다.
create or replace function public.chef_reject_reason(p_meta jsonb, p_elapsed numeric)
returns text
language plpgsql
stable   -- game_guards 를 읽는다
security definer
set search_path = public, pg_temp
as $$
declare
  v_guard   jsonb   := coalesce(public.cfg('game_guards') -> 'chef', '{}'::jsonb);
  v_served  numeric := coalesce(public.meta_num(p_meta, 'served_total'), -1);
  v_orders  numeric := coalesce(public.meta_num(p_meta, 'orders'), -1);
  v_courses numeric := coalesce(public.meta_num(p_meta, 'courses'), 0);
  v_combo   numeric := coalesce(public.meta_num(p_meta, 'max_combo'), 0);
  v_perf    numeric := coalesce(public.meta_num(p_meta, 'perfects'), 0);
  v_hot     numeric := coalesce(public.meta_num(p_meta, 'hotfixes'), 0);
  v_corders numeric := coalesce(public.meta_num(p_meta, 'clean_orders'), 0);
  v_cbuilds numeric := coalesce(public.meta_num(p_meta, 'clean_builds'), 0);
  v_stage   numeric := coalesce(public.meta_num(p_meta, 'stage_max'), 0);
  v_inf     numeric := coalesce(public.meta_num(p_meta, 'inf_level'), 0);
  v_dur     numeric := public.meta_num(p_meta, 'duration_s');
  v_stars   numeric := 0;
  v_k       int;
begin
  for v_k in 0..4 loop
    v_stars := v_stars + public.chef_star(p_meta, v_k);
  end loop;

  if v_served < 0 or v_orders < 0 or v_courses < 0 or v_combo < 0 or v_perf < 0 or v_hot < 0
     or v_corders < 0 or v_cbuilds < 0 then
    return '기록 값이 올바르지 않아요';
  elsif v_stars <> v_served then
    return '접시 수가 맞지 않아요';
  -- 테이블 3개를 동시에 돌려도 접시 하나에 1.2초보다 빨리 낼 수 없다
  elsif v_served > p_elapsed / coalesce((v_guard ->> 'min_sec_per_plate')::numeric, 1.2) + 3 then
    return '요리 속도가 물리적으로 불가능해요';
  -- 코스는 네 접시, 주문 하나
  elsif v_orders > v_served or v_courses * 4 > v_served or v_courses > v_orders then
    return '주문 수가 접시 수와 맞지 않아요';
  -- 단계는 끝낸 주문 수로 정해진다
  elsif v_stage <> public.chef_stage(v_orders, v_courses) then
    return '도달 단계가 주문 수와 맞지 않아요';
  -- ∞ LV 은 들어간 뒤 30초마다 1씩
  elsif (v_stage >= 26 and (v_inf < 1 or v_inf > floor(p_elapsed / 30) + 1))
     or (v_stage < 26 and v_inf <> 0) then
    return '∞ 레벨이 올바르지 않아요';
  elsif v_combo > v_served or v_perf > v_served or v_hot > v_served then
    return '보너스 기록이 접시 수와 맞지 않아요';
  -- CLEAN BUILD 는 두 주문 이상을 한 번에 비웠을 때만
  elsif v_corders > v_orders or v_cbuilds * 2 > v_corders then
    return 'CLEAN BUILD 기록이 올바르지 않아요';
  elsif v_dur is not null and v_dur > p_elapsed + 2 then
    return '플레이 시간이 서버 기록과 맞지 않아요';
  end if;
  return null;
end;
$$;

comment on function public.chef_reject_reason(jsonb, numeric)
  is '아울 레스토랑 메타 거부 사유 (없으면 null) — games/chef/engine/score.ts 의 serverReject 와 같은 식.';

-- 2.5 서버 재계산 원점수
create or replace function public.chef_raw(p_meta jsonb)
returns numeric
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
declare
  v_orders  numeric := greatest(0, coalesce(public.meta_num(p_meta, 'orders'), 0));
  v_courses numeric := greatest(0, coalesce(public.meta_num(p_meta, 'courses'), 0));
  v_combo   numeric := greatest(0, coalesce(public.meta_num(p_meta, 'max_combo'), 0));
  v_perf    numeric := greatest(0, coalesce(public.meta_num(p_meta, 'perfects'), 0));
  v_hot     numeric := greatest(0, coalesce(public.meta_num(p_meta, 'hotfixes'), 0));
  v_corders numeric := greatest(0, coalesce(public.meta_num(p_meta, 'clean_orders'), 0));
  v_dish    numeric := greatest(0, coalesce(public.meta_num(p_meta, 'dish_score'), 0));
  v_bonus   numeric := greatest(0, coalesce(public.meta_num(p_meta, 'bonus_score'), 0));
  v_inf     numeric := greatest(0, coalesce(public.meta_num(p_meta, 'inf_level'), 0));
  v_stage   int     := public.chef_stage(v_orders, v_courses);
  v_mult    numeric := public.chef_mult(v_stage);
  v_base    numeric;
  v_n       int;
begin
  -- 별 1~5 기본 점수 100 · 150 · 220 · 300 · 400
  v_base := greatest(0, public.chef_star(p_meta, 0)) * 100
          + greatest(0, public.chef_star(p_meta, 1)) * 150
          + greatest(0, public.chef_star(p_meta, 2)) * 220
          + greatest(0, public.chef_star(p_meta, 3)) * 300
          + greatest(0, public.chef_star(p_meta, 4)) * 400;
  v_dish  := least(v_dish, v_base * (1.5 + 0.1 * least(greatest(v_combo - 1, 0), 15)) * v_mult);
  v_bonus := least(v_bonus, (v_perf * 50 + v_hot * 80 + v_corders * 100 + v_courses * 1000) * v_mult);
  v_n     := least(v_stage, 26) - 1;
  if v_stage < 26 then
    v_inf := 0;
  else
    v_inf := greatest(1, v_inf);
  end if;
  return v_dish + v_bonus + 100 * v_n * (v_n + 1) / 2 + 500 * greatest(0, v_inf - 1);
end;
$$;

comment on function public.chef_raw(jsonb)
  is '아울 레스토랑 원점수 서버 재계산 (games/chef/engine/score.ts 의 serverRaw 와 같은 식).';

revoke execute on function public.chef_reject_reason(jsonb, numeric) from public, anon, authenticated;
revoke execute on function public.chef_raw(jsonb) from public, anon, authenticated;
