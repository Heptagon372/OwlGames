-- =====================================================================
-- OWL GAMES — 레벨/랭크/티켓 수학 검증 (§5, §14 P1 수용 기준)
--   실행: psql "<connection-string>" -f supabase/tests/level_curve.sql
--         또는 Supabase SQL 편집기에 전체 붙여넣기
--   결과: 오류 없이 끝나면 통과 (마지막에 NOTICE 로 요약 출력)
--   주의: 기본 곡선(base 30 / step 5)을 가정하므로 트랜잭션 안에서 잠시 기본값으로
--         되돌린 뒤 rollback 한다. 영구 변경 없음.
-- =====================================================================

begin;
set local plpgsql.check_asserts = on;

insert into public.app_config (key, value) values ('level_curve', '{"base":30,"step":5}'::jsonb)
on conflict (key) do update set value = excluded.value;

do $$
declare
  v_prev     int;
  v_cum      int;
  v_need     int;
  v_rank     int;
  v_rank_b   int;
  v_tickets  int;
  v_points   int;
  v_step     int;
  v_bounds   int[] := array[1, 8, 15, 22, 28, 34, 40, 46, 52, 58, 64, 70, 76, 82, 88, 94, 100];
  v_tiers    int[] := array[1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 6];  -- idx 0..16
  v_next_min int;
begin
  -- ===== 1. 누적 포인트 곡선 =========================================
  assert public.level_cum_points(1) = 0,
         format('Lv1 누적은 0 이어야 함: %s', public.level_cum_points(1));
  assert public.level_cum_points(2) = 35,
         format('Lv2 누적은 35 이어야 함: %s', public.level_cum_points(2));
  assert public.level_cum_points(3) = 75,
         format('Lv3 누적은 75 이어야 함: %s', public.level_cum_points(3));
  assert public.level_cum_points(100) = 27720,
         format('Lv100 누적은 27720 이어야 함: %s', public.level_cum_points(100));

  -- 레벨 L → L+1 필요 포인트 = 30 + 5L (§5.1)
  v_prev := public.level_cum_points(1);
  for l in 2..100 loop
    v_cum  := public.level_cum_points(l);
    v_need := v_cum - v_prev;
    assert v_need = 30 + 5 * (l - 1),
           format('Lv%s→Lv%s 필요 포인트가 %s (기대 %s)', l - 1, l, v_need, 30 + 5 * (l - 1));
    v_prev := v_cum;
  end loop;

  -- ===== 2. level_from_points 경계 ===================================
  assert public.level_from_points(-100)  = 1,   '음수 포인트는 Lv1';
  assert public.level_from_points(0)     = 1,   '0P → Lv1';
  assert public.level_from_points(34)    = 1,   '34P → Lv1 (Lv2 는 35P)';
  assert public.level_from_points(35)    = 2,   '35P → Lv2';
  assert public.level_from_points(74)    = 2,   '74P → Lv2';
  assert public.level_from_points(75)    = 3,   '75P → Lv3';
  assert public.level_from_points(27719) = 99,  '27719P → Lv99';
  assert public.level_from_points(27720) = 100, '27720P → Lv100';
  assert public.level_from_points(999999)= 100, '상한 100 고정';

  -- 모든 레벨 경계에서 정확히 한 칸씩 오르는지
  for l in 2..100 loop
    v_cum := public.level_cum_points(l);
    assert public.level_from_points(v_cum) = l,
           format('%sP 는 Lv%s 여야 함 (실제 %s)', v_cum, l, public.level_from_points(v_cum));
    assert public.level_from_points(v_cum - 1) = l - 1,
           format('%sP 는 Lv%s 여야 함 (실제 %s)', v_cum - 1, l - 1, public.level_from_points(v_cum - 1));
  end loop;

  -- ===== 3. rank_from_level 모든 구간 경계 (§5.2) ====================
  assert public.rank_from_level(0) = 0, '레벨 0 이하도 랭크 0';
  for i in 1..17 loop
    -- 구간 시작 레벨 → 랭크 i-1
    assert public.rank_from_level(v_bounds[i]) = i - 1,
           format('Lv%s 는 랭크 %s 여야 함 (실제 %s)',
                  v_bounds[i], i - 1, public.rank_from_level(v_bounds[i]));
    -- 구간 마지막 레벨 → 여전히 랭크 i-1
    if i < 17 then
      v_next_min := v_bounds[i + 1];
      assert public.rank_from_level(v_next_min - 1) = i - 1,
             format('Lv%s 는 랭크 %s 여야 함 (실제 %s)',
                    v_next_min - 1, i - 1, public.rank_from_level(v_next_min - 1));
    end if;
  end loop;
  assert public.rank_from_level(100) = 16, 'Lv100 = 챌린저(16)';
  assert public.rank_from_level(150) = 16, '상한 밖도 16';

  -- 레벨 1~100 전체가 단조 증가하며 0~16 안에 있는지
  v_rank := 0;
  for l in 1..100 loop
    v_rank_b := public.rank_from_level(l);
    assert v_rank_b between 0 and 16, format('Lv%s 랭크 범위 이탈: %s', l, v_rank_b);
    assert v_rank_b >= v_rank, format('Lv%s 에서 랭크가 감소함', l);
    v_rank := v_rank_b;
  end loop;

  -- ===== 4. tier_from_rank 매핑 (§5.2) ===============================
  for i in 1..17 loop
    assert public.tier_from_rank(i - 1) = v_tiers[i],
           format('랭크 %s 는 T%s 여야 함 (실제 T%s)',
                  i - 1, v_tiers[i], public.tier_from_rank(i - 1));
  end loop;

  -- ===== 5. 랭크업 티켓 총합 = 16 (§5.3) =============================
  -- (a) 0 → 16 한 칸씩
  v_tickets := 0;
  v_rank    := 0;
  for i in 1..16 loop
    v_tickets := v_tickets + (i - v_rank);
    v_rank    := i;
  end loop;
  assert v_tickets = 16, format('한 칸씩 올라가면 16장이어야 함: %s', v_tickets);

  -- (b) submit_game_session 과 동일한 방식으로 포인트를 쌓아가며 랭크업 티켓 합산
  --     (여러 랭크를 건너뛰어도 합계는 16)
  foreach v_step in array array[30, 150, 300, 27720] loop
    v_points  := 0;
    v_rank    := 0;
    v_tickets := 0;
    while v_points < 27720 loop
      v_points := v_points + v_step;
      v_rank_b := greatest(v_rank, public.rank_from_level(public.level_from_points(v_points)));
      v_tickets := v_tickets + (v_rank_b - v_rank);
      v_rank := v_rank_b;
    end loop;
    assert v_rank = 16,
           format('%sP 씩 쌓으면 마지막 랭크는 16 이어야 함: %s', v_step, v_rank);
    assert v_tickets = 16,
           format('%sP 씩 쌓았을 때 티켓 총합이 %s (기대 16)', v_step, v_tickets);
  end loop;

  -- 27720P 미만에서는 절대 16 랭크가 되지 않는다
  assert public.rank_from_level(public.level_from_points(27719)) = 15,
         '27719P 는 신화(15) 까지만';

  -- ===== 6. 이름 마스킹 ==============================================
  assert public.mask_name('홍길동')  = '홍*동',  format('홍길동 → %s', public.mask_name('홍길동'));
  assert public.mask_name('남궁민수') = '남**수', format('남궁민수 → %s', public.mask_name('남궁민수'));
  assert public.mask_name('김수')    = '김*',    format('김수 → %s', public.mask_name('김수'));
  assert public.mask_name('김')      = '김',     format('김 → %s', public.mask_name('김'));
  assert public.mask_name(null) is null, 'null 은 null';

  raise notice '✅ level_curve: 누적곡선 / level_from_points / rank_from_level / tier_from_rank / 티켓 16장 / 마스킹 모두 통과';
end $$;

rollback;
