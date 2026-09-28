-- =====================================================================
-- OWL GAMES — 레벨/랭크/티켓 수학 검증 (rank_v2 · rank_v3 — 20261020 · 20261021)
--   실행: psql "<connection-string>" -f supabase/tests/level_curve.sql
--         또는 Supabase SQL 편집기에 전체 붙여넣기
--   결과: 오류 없이 끝나면 통과 (마지막에 NOTICE 로 요약 출력)
--   주의: 기본 곡선(base 60 / step 19)을 가정하므로 트랜잭션 안에서 잠시 기본값으로
--         되돌린 뒤 rollback 한다. 영구 변경 없음.
-- =====================================================================

begin;
set local plpgsql.check_asserts = on;

insert into public.app_config (key, value) values ('level_curve', '{"base":60,"step":19}'::jsonb)
on conflict (key) do update set value = excluded.value;

do $$
declare
  v_prev    int;
  v_cum     int;
  v_rank    int;
  v_rank_b  int;
  v_tickets int;
  v_points  int;
  v_step    int;
  v_gap     int;
  v_gap_b   int;
  v_bounds  int[] := array[
    0, 100, 220, 360, 520, 700, 900, 1120, 1360, 1620,
    1900, 2200, 2520, 2860, 3560, 4300, 5080, 5900, 6760, 8560,
    12360, 16360, 20560, 24960, 33360, 42160, 51360, 60960, 79360, 100000];
  v_tiers   int[] := array[1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 6, 7, 7, 7,
                           8, 8, 8, 8, 9, 9, 9, 9, 10, 11];  -- idx 0..29
begin
  -- ===== 1. 누적 포인트 곡선 (Lv L → L+1 = 60 + 19L) =====================
  assert public.level_cum_points(1) = 0, 'Lv1 누적은 0';
  assert public.level_cum_points(2) = 79, format('Lv2 누적은 79: %s', public.level_cum_points(2));
  assert public.level_cum_points(100) = 99990,
         format('Lv100 누적은 99990 (≈ 챌린저 100,000): %s', public.level_cum_points(100));
  v_prev := 0;
  for l in 2..100 loop
    v_cum := public.level_cum_points(l);
    assert v_cum - v_prev = 60 + 19 * (l - 1), format('Lv%s→Lv%s 필요 포인트 %s', l - 1, l, v_cum - v_prev);
    assert public.level_from_points(v_cum) = l, format('%sP 는 Lv%s', v_cum, l);
    assert public.level_from_points(v_cum - 1) = l - 1, format('%sP 는 Lv%s', v_cum - 1, l - 1);
    v_prev := v_cum;
  end loop;
  assert public.level_from_points(999999) = 100, '상한 100 고정';

  -- ===== 2. rank_from_points 모든 경계 · 간격은 늘기만 한다 ===============
  assert public.rank_from_points(-100) = 0, '음수는 나무';
  assert public.rank_from_points(null) = 0, 'null 은 나무';
  for i in 1..30 loop
    assert public.rank_from_points(v_bounds[i]) = i - 1,
           format('%sP 는 랭크 %s (실제 %s)', v_bounds[i], i - 1, public.rank_from_points(v_bounds[i]));
    if i > 1 then
      assert public.rank_from_points(v_bounds[i] - 1) = i - 2, format('%sP 는 랭크 %s', v_bounds[i] - 1, i - 2);
    end if;
    if i > 2 then
      v_gap   := v_bounds[i] - v_bounds[i - 1];
      v_gap_b := v_bounds[i - 1] - v_bounds[i - 2];
      assert v_gap > v_gap_b, format('랭크 %s 간격(%s)이 앞 간격(%s)보다 길어야 함', i - 1, v_gap, v_gap_b);
    end if;
  end loop;
  assert public.rank_from_points(2147483647) = 29, '상한 29';

  -- ===== 3. tier_from_rank (11티어, 보너스 티켓 30+ 은 T11) ================
  for i in 1..30 loop
    assert public.tier_from_rank(i - 1) = v_tiers[i],
           format('랭크 %s 는 T%s (실제 T%s)', i - 1, v_tiers[i], public.tier_from_rank(i - 1));
  end loop;
  assert public.tier_from_rank(30) = 11 and public.tier_from_rank(99) = 11, '보너스 티켓은 T11';

  -- ===== 4. 챌린저 보너스 (20,640 × 1.25ⁿ, 100P 올림) ====================
  assert public.challenger_bonus_count(100000) = 0, '챌린저 도달 = 보너스 0';
  assert public.challenger_bonus_count(125799) = 0, '125799P = 0';
  assert public.challenger_bonus_count(125800) = 1, '125800P = 1';
  assert public.challenger_bonus_count(158100) = 2, '158100P = 2';
  assert public.challenger_bonus_count(198500) = 3, '198500P = 3';
  assert public.challenger_bonus_count(249000) = 4, '249000P = 4';
  assert public.challenger_bonus_count(2147483647) > 20, 'int 끝까지 가도 멈춘다';

  -- ===== 5. 랭크 티켓 29장 — submit 과 같은 방식으로 쌓아도 =================
  foreach v_step in array array[50, 170, 900, 100000] loop
    v_points := 0; v_rank := 0; v_tickets := 0;
    while v_points < 100000 loop
      v_points := v_points + v_step;
      v_rank_b := greatest(v_rank, public.rank_from_points(v_points));
      v_tickets := v_tickets + (v_rank_b - v_rank);
      v_rank := v_rank_b;
    end loop;
    assert v_rank = 29 and v_tickets = 29, format('%sP 씩: 랭크 %s · 티켓 %s (기대 29 · 29)', v_step, v_rank, v_tickets);
  end loop;

  -- ===== 6. 확률표: 11티어 · 한 줄 안에서 아래 등수가 더 높다 · 꽝이 가장 크다 =====
  for t in 1..11 loop
    declare
      v_row jsonb := public.cfg('gacha_table') -> (t::text);
      v_sum numeric := 0;
      v_p   numeric := 0;
      v_n   numeric;
    begin
      assert v_row is not null, format('T%s 가 없음', t);
      for k in 0..jsonb_array_length(v_row) - 1 loop
        v_n := (v_row ->> k)::numeric;
        assert v_n > v_p or k = 0, format('T%s %s등이 %s등보다 낮음', t, k + 1, k);
        v_p := v_n; v_sum := v_sum + v_n;
      end loop;
      assert 100 - v_sum > v_p, format('T%s 꽝(%s)이 가장 커야 함', t, 100 - v_sum);
    end;
  end loop;
  assert (public.cfg('gacha_table') -> '11' ->> 0)::numeric = 5, '챌린저 1등 5%';

  -- ===== 7. 이름 마스킹 ==============================================
  assert public.mask_name('홍길동')  = '홍*동',  format('홍길동 → %s', public.mask_name('홍길동'));
  assert public.mask_name('남궁민수') = '남**수', format('남궁민수 → %s', public.mask_name('남궁민수'));
  assert public.mask_name('김수')    = '김*',    format('김수 → %s', public.mask_name('김수'));
  assert public.mask_name('김')      = '김',     format('김 → %s', public.mask_name('김'));
  assert public.mask_name(null) is null, 'null 은 null';

  raise notice '✅ rank_v2·v3: 레벨 곡선 / rank_from_points / tier_from_rank / 챌린저 보너스 / 티켓 29장 / 확률표 / 마스킹 모두 통과';
end $$;

rollback;
