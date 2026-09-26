-- =====================================================================
-- OWL GAMES — 실제 구매한 상품으로 경품·확률 교체 (§6)
--
--   등수가 5개 → **6개**로 늘었다. 그래서 세 군데를 같이 고친다.
--     1) prizes.place 체크 제약 (1~5 → 1~6)
--     2) gacha_pick 의 루프 (1..5 하드코딩 → 확률표 길이만큼)
--     3) app_config.gacha_table (티어별 6칸)
--
--   확률은 **T1 기준**이 아래 표이고, 티어가 오르면 상위 등수가 올라가고 꽝이 줄어든다.
--   1등은 1%(T1) → 5%(T6). 재고가 0이면 gacha_pick 이 그 등수를 꽝으로 돌린다(기존 동작).
-- =====================================================================

-- 1) 등수 범위 --------------------------------------------------------
alter table public.prizes drop constraint if exists prizes_place_check;
alter table public.prizes add  constraint prizes_place_check check (place between 1 and 6);

-- 2) 추첨 함수 — 확률표 길이를 따라간다 (다음에 등수가 또 늘어도 안 고쳐도 된다)
create or replace function public.gacha_pick(
  p_tier          int,
  p_roll          numeric,
  p_respect_stock boolean default true
)
returns int
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_row   jsonb := public.cfg('gacha_table') -> (p_tier::text);
  v_acc   numeric := 0;
  v_stock int;
  v_n     int;
begin
  if v_row is null or jsonb_typeof(v_row) <> 'array' then
    raise exception '뽑기 확률표 설정이 올바르지 않아요 (T%)', p_tier using errcode = 'P0001';
  end if;

  v_n := jsonb_array_length(v_row);

  for k in 1..v_n loop
    v_acc := v_acc + coalesce((v_row ->> (k - 1))::numeric, 0);
    if p_roll < v_acc then
      if p_respect_stock then
        select stock into v_stock from public.prizes where place = k;
        if coalesce(v_stock, 0) <= 0 then
          return null;  -- 재고 0 → 꽝
        end if;
      end if;
      return k;
    end if;
  end loop;

  return null;  -- 꽝
end;
$$;

revoke execute on function public.gacha_pick(int, numeric, boolean) from public, anon, authenticated;

-- 3) 상품 ------------------------------------------------------------
--    draws.place 가 prizes 를 참조하므로 지우지 않고 덮어쓴다 (지난 추첨 기록 보존).
--    지난 기록의 상품명은 draws.prize_name 스냅샷에 남아 있어서 그대로 읽힌다.
insert into public.prizes (place, name, stock) values
  (1, '게이밍 PC',              1),
  (2, '버티컬 마우스',           2),
  (3, '게이밍 키보드 · 장패드',   3),   -- 장패드 2 + 키보드 1
  (4, '키캡 키링',              2),
  (5, '과자 세트 10종',        100),
  (6, '하리보 젤리',           150)
on conflict (place) do update
  set name  = excluded.name,
      stock = excluded.stock;

-- 4) 확률표 ----------------------------------------------------------
--    [1등, 2등, 3등, 4등, 5등, 6등] · 나머지가 꽝
--    T1  1 / 3 / 6 / 10 / 20 / 25  → 꽝 35.0
--    T6  5 / 6 / 9 / 15 / 25 / 30  → 꽝 10.0
insert into public.app_config (key, value) values
  ('gacha_table', jsonb_build_object(
     '1', jsonb_build_array(1,   3,   6,   10, 20, 25),
     '2', jsonb_build_array(1.5, 3.5, 6.5, 11, 21, 26),
     '3', jsonb_build_array(2,   4,   7,   12, 22, 27),
     '4', jsonb_build_array(3,   4.5, 7.5, 13, 23, 28),
     '5', jsonb_build_array(4,   5,   8,   14, 24, 29),
     '6', jsonb_build_array(5,   6,   9,   15, 25, 30)
   ))
on conflict (key) do update set value = excluded.value;
