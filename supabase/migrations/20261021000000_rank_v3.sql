-- =====================================================================
-- OWL GAMES — 랭크 v3: 챌린저 = 100,000P · 20단계(불멸)부터 가파르게 (DECISIONS §5-48)
--
--   사용자 요청: "만렙을 10만 점으로. 19단계(불멸자)까지는 지금 그대로 두고, 20단계부터 확실히 경험치를 얻기 힘들게."
--
--   바뀌는 것 (rank_v2 의 나머지 — 티어 11개 · 확률표 · 보너스 티켓 규칙 · submit 본문 — 는 그대로)
--     1) rank_from_points: idx 0~18(나무~불멸자) 그대로, idx 19~29 를 새로
--        간격(P): 불멸 1,800 (앞 간격 860 의 ×2.1) → 영겁 3,800 (×2.1) → 전설·신성·신화 +200
--                 태초 8,400 (×1.9) → 성좌·전상·극점 +400 → 정점 18,400 (×1.9) → 챌린저 20,640
--        → 불멸 8,560 · 영겁 12,360 · 전설 16,360 · 신성 20,560 · 신화 24,960 · 태초 33,360
--          성좌 42,160 · 전상 51,360 · 극점 60,960 · 정점 79,360 · 챌린저 100,000
--     2) challenger_bonus_count: 기준 100,000 · 첫 앞 간격 20,640 (정점 → 챌린저) × 1.25ⁿ, 100P 올림
--        → 125,800 · 158,100 · 198,500 · 249,000 …
--     3) 레벨 곡선 60 + 19L → Lv 100 = 99,990P (정수 base·step 로는 100,000 이 딱 떨어지지 않는다 — 10P 차이)
--     4) 기존 유저: 레벨만 다시 계산. 랭크는 내려가지 않으므로(기준이 올라가기만 했다) 그대로, 티켓도 그대로.
--
--   submit_game_session_core(rank_v2)는 rank_from_points · challenger_bonus_count 를 이름으로 부르므로 다시 만들 필요가 없다.
--   TS 사본: lib/rank.ts (RANKS[].minPoints · DEFAULT_CURVE) · lib/config.ts (level_curve) — tests/rank.test.ts 가 대조한다.
-- =====================================================================

insert into public.app_config (key, value) values ('level_curve', '{"base":60,"step":19}'::jsonb)
on conflict (key) do update set value = excluded.value;

create or replace function public.rank_from_points(p int)
returns int
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(max(t.idx - 1), 0)::int
    from unnest(array[
           0, 100, 220, 360, 520, 700, 900, 1120, 1360, 1620,
           1900, 2200, 2520, 2860, 3560, 4300, 5080, 5900, 6760, 8560,
           12360, 16360, 20560, 24960, 33360, 42160, 51360, 60960, 79360, 100000
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
  v_iv  bigint := 20640;
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

-- 레벨은 표시용 — 새 곡선으로 다시 계산 (랭크·티켓은 그대로)
update public.profiles
   set level = public.level_from_points(total_points);
