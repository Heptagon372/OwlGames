-- =====================================================================
-- OWL GAMES — 랭크 v4: 1~17단계 = 옛 17단계 점수 · 18~30단계 = 27,720 → 100,000 (DECISIONS §5-50)
--
--   사용자 요청: "옛날하고 지금하고 점수는 같되, 랭크와 시스템은 지금 요청한 대로."
--     · 1~17단계(나무~엘리트)의 기준 점수 = 옛 17단계(나무~챌린저) 점수 그대로
--       (옛 식: 레벨 경계 1·8·15·…·100 의 누적 포인트 30(L−1) + 5(L−1)L/2 → 0 · 350 · 945 · … · 27,720)
--     · 랭크 이름·그림 30종, 뽑기 11티어·확률표, 챌린저 보너스 티켓, 만렙(챌린저) 100,000P 는 지금 요청 그대로
--     · 18~30단계는 27,720 → 100,000 사이를 간격이 계속 커지게, **20단계(불멸)에서 크게**(×1.41) 뛴다.
--       영겁·태초·정점도 한 번씩 더 뛴다(×1.13~1.14). 간격(P):
--         초월자 3,150 · 불멸자 3,200 · 불멸 4,500 · 영겁 5,100 · 전설 5,200 · 신성 5,300 · 신화 5,400
--         태초 6,150 · 성좌 6,250 · 전상 6,400 · 극점 6,550 · 정점 7,450 · 챌린저 7,630
--
--   바뀌는 것
--     1) rank_from_points — 새 30칸 표
--     2) challenger_bonus_count — 첫 앞 간격 7,630(정점 → 챌린저) × 1.25ⁿ, 100P 올림
--        → 109,600 · 121,600 · 136,600 · 155,400 …
--     3) 기존 유저 랭크를 새 표로 **다시 계산한다(내려갈 수 있다)**. 이미 받은 티켓은 그대로 —
--        tickets_one_per_rank 때문에 같은 랭크에 다시 올라가도 티켓이 또 나오지는 않는다.
--   레벨 곡선(60 + 19L, rank_v3)·티어·확률표·submit_game_session_core 는 그대로다
--   (core 는 rank_from_points · challenger_bonus_count 를 이름으로 부른다).
--
--   TS 사본: lib/rank.ts (RANKS[].minPoints) — tests/rank.test.ts 가 이 파일의 숫자와 옛 식을 대조한다.
-- =====================================================================

create or replace function public.rank_from_points(p int)
returns int
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(max(t.idx - 1), 0)::int
    from unnest(array[
           0, 350, 945, 1785, 2700, 3795, 5070, 6525, 8160, 9975,
           11970, 14145, 16500, 19035, 21750, 24645, 27720, 30870, 34070, 38570,
           43670, 48870, 54170, 59570, 65720, 71970, 78370, 84920, 92370, 100000
         ]) with ordinality as t(min_points, idx)
   where t.min_points <= greatest(coalesce(p, 0), 0)
$$;

create or replace function public.challenger_bonus_count(p int)
returns int
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
declare
  v_p   bigint := greatest(coalesce(p, 0), 0);
  v_iv  bigint := 7630;
  v_thr bigint := 100000;
  v_n   int    := 0;
begin
  loop
    v_iv  := (v_iv * 5 / 4 + 99) / 100 * 100;
    v_thr := v_thr + v_iv;
    exit when v_p < v_thr;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

grant execute on function public.rank_from_points(int) to anon, authenticated;
grant execute on function public.challenger_bonus_count(int) to anon, authenticated;

-- 기존 유저: 랭크를 새 표로 다시 계산 (내려갈 수 있다 — 티켓은 그대로)
update public.profiles
   set rank_idx = public.rank_from_points(total_points),
       level    = public.level_from_points(total_points)
 where rank_idx is distinct from public.rank_from_points(total_points)
    or level    is distinct from public.level_from_points(total_points);
