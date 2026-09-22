-- =====================================================================
-- OWL GAMES — 뽑기 확률 시뮬레이션 (§6, §14 P5 수용 기준)
--   티어별 100,000회를 실제 추첨과 "같은" 함수(gacha_roll + gacha_pick)로 굴려
--   확률표와의 차이가 0.5%p 를 넘으면 예외를 던진다. 재고 차감·draws 기록은 하지 않는다.
--
--   실행: psql "<connection-string>" -f supabase/tests/gacha_simulation.sql
--         또는 Supabase SQL 편집기에 전체 붙여넣기 (마지막 SELECT 결과표가 보인다)
--   소요: 환경에 따라 10~60초. 트랜잭션 전체를 rollback 하므로 영구 변경은 없다.
--   주의: 재고 0 검증 구간에서 prizes 5행을 잠그므로 행사 운영 중에는 실행하지 말 것.
--   참고: 100,000회 / ±0.5%p 는 약 3σ 수준이라 정상 구현이어도 드물게(≈1% 확률로)
--         실패할 수 있다. 실패하면 한 번 더 돌려보고, 반복 실패면 진짜 버그다.
-- =====================================================================

begin;
set local statement_timeout = 0;
set local plpgsql.check_asserts = on;

create temp table gacha_sim_result (
  tier         int,        -- 1~6 = 티어, 0 = 재고 0 검증 구간(T6)
  slot         int,        -- 1~5 = 등수, 6 = 꽝
  label        text,
  expected_pct numeric,
  observed_pct numeric,
  diff_pp      numeric,
  ok           boolean
) on commit drop;

do $$
declare
  c_n     constant int     := 100000;   -- 티어당 시뮬 횟수
  c_tol   constant numeric := 0.5;      -- 허용 오차 (%p)
  v_tbl   jsonb := public.cfg('gacha_table');
  v_cnt   int[];
  v_zero  int[];
  v_place int;
  v_exp   numeric;
  v_obs   numeric;
  v_win   numeric;
  v_fail  text := '';
  v_label text;
begin
  -- ===== 1. 티어별 분포 =============================================
  -- 재고와 무관한 "순수" 분포를 보려고 p_respect_stock => false 로 호출한다.
  -- (재고가 충분할 때 실제 추첨과 완전히 동일한 경로)
  for t in 1..6 loop
    v_cnt := array[0, 0, 0, 0, 0, 0];
    for i in 1..c_n loop
      v_place := coalesce(public.gacha_pick(t, public.gacha_roll(), false), 6);
      v_cnt[v_place] := v_cnt[v_place] + 1;
    end loop;

    v_win := 0;
    for k in 1..6 loop
      if k <= 5 then
        v_exp   := coalesce(((v_tbl -> (t::text)) ->> (k - 1))::numeric, 0);
        v_win   := v_win + v_exp;
        v_label := k || '등';
      else
        v_exp   := 100 - v_win;
        v_label := '꽝';
      end if;

      v_obs := round(v_cnt[k] * 100.0 / c_n, 4);

      insert into pg_temp.gacha_sim_result
      values (t, k, v_label, v_exp, v_obs, round(v_obs - v_exp, 4), abs(v_obs - v_exp) <= c_tol);

      raise notice 'T% %  기대 % %%  관측 % %%  차이 % %%p',
        t, v_label, v_exp, v_obs, round(v_obs - v_exp, 4);

      if abs(v_obs - v_exp) > c_tol then
        v_fail := v_fail || format('T%s %s: 기대 %s%% / 관측 %s%% (차이 %s%%p)  ',
                                   t, v_label, v_exp, v_obs, round(v_obs - v_exp, 4));
      end if;
    end loop;
  end loop;

  if v_fail <> '' then
    raise exception '뽑기 확률 시뮬레이션 실패 (허용 오차 ±% 퍼센트포인트): %', c_tol, v_fail
      using errcode = 'P0001';
  end if;

  -- ===== 2. 재고 0 → 꽝 흡수(재분배 금지) 검증 =======================
  -- prizes 를 임시로 바꾼 뒤 서브트랜잭션을 롤백한다(스크립트 밖에서 실행해도 안전).
  -- 집계는 plpgsql 변수(v_zero)에 담아 두므로 롤백돼도 살아남는다.
  v_zero := array[0, 0, 0, 0, 0, 0];
  begin
    update public.prizes set stock = 10;

    -- 2.1 재고가 충분할 때의 슬라이스 경계 (T1 = 0.01 / 0.5 / 3 / 10 / 20)
    assert public.gacha_pick(1, 0,         true) = 1,     'roll 0 → 1등';
    assert public.gacha_pick(1, 0.009999,  true) = 1,     '1등 슬라이스 끝';
    assert public.gacha_pick(1, 0.01,      true) = 2,     '0.01 → 2등 시작';
    assert public.gacha_pick(1, 0.509999,  true) = 2,     '2등 슬라이스 끝';
    assert public.gacha_pick(1, 0.51,      true) = 3,     '0.51 → 3등 시작';
    assert public.gacha_pick(1, 3.509999,  true) = 3,     '3등 슬라이스 끝';
    assert public.gacha_pick(1, 3.51,      true) = 4,     '3.51 → 4등 시작';
    assert public.gacha_pick(1, 13.509999, true) = 4,     '4등 슬라이스 끝';
    assert public.gacha_pick(1, 13.51,     true) = 5,     '13.51 → 5등 시작';
    assert public.gacha_pick(1, 33.509999, true) = 5,     '5등 슬라이스 끝';
    assert public.gacha_pick(1, 33.51,     true) is null, '당첨 합계 밖 → 꽝';
    assert public.gacha_pick(1, 99.999999, true) is null, '맨 끝 → 꽝';

    -- 2.2 2등·4등 재고 0
    update public.prizes set stock = 0 where place in (2, 4);

    assert public.gacha_pick(1, 0.2, true) is null, '재고 0 인 2등 슬라이스 → 꽝';
    assert public.gacha_pick(1, 0.2, false) = 2,    '순수 선택 자체는 그대로 2등';
    assert public.gacha_pick(1, 5,   true) is null, '재고 0 인 4등 슬라이스 → 꽝';
    -- 재분배 금지: 2·4등 슬라이스가 다른 등수로 넘어가지 않는다
    assert public.gacha_pick(1, 0,   true) = 1,     '1등 슬라이스 불변';
    assert public.gacha_pick(1, 1.0, true) = 3,     '3등 슬라이스 불변';
    assert public.gacha_pick(1, 20,  true) = 5,     '5등 슬라이스 불변';

    -- 2.3 표본으로도 확인 (T6: 2등 3.0% + 4등 20% 가 전부 꽝으로)
    for i in 1..c_n loop
      v_place := coalesce(public.gacha_pick(6, public.gacha_roll(), true), 6);
      v_zero[v_place] := v_zero[v_place] + 1;
    end loop;

    assert v_zero[2] = 0, format('재고 0 인 2등이 %s회 당첨됨', v_zero[2]);
    assert v_zero[4] = 0, format('재고 0 인 4등이 %s회 당첨됨', v_zero[4]);

    -- prizes 원복 (서브트랜잭션 롤백)
    raise exception using errcode = 'OWL00', message = 'rollback marker';
  exception when sqlstate 'OWL00' then
    null;
  end;

  -- 재고 0 구간 집계는 롤백 이후에 기록한다
  v_win := 0;
  for k in 1..6 loop
    if k <= 5 then
      v_exp   := case when k in (2, 4) then 0
                      else coalesce(((v_tbl -> '6') ->> (k - 1))::numeric, 0) end;
      v_win   := v_win + coalesce(((v_tbl -> '6') ->> (k - 1))::numeric, 0);
      v_label := k || '등';
    else
      -- 꽝 = 원래 꽝 + 재고 0 인 2등·4등 확률 (재분배 없음)
      v_exp   := 100 - v_win
                 + coalesce(((v_tbl -> '6') ->> 1)::numeric, 0)
                 + coalesce(((v_tbl -> '6') ->> 3)::numeric, 0);
      v_label := '꽝';
    end if;

    v_obs := round(v_zero[k] * 100.0 / c_n, 4);

    insert into pg_temp.gacha_sim_result
    values (0, k, v_label || ' / T6 · 2·4등 재고 0', v_exp, v_obs,
            round(v_obs - v_exp, 4), abs(v_obs - v_exp) <= c_tol);

    raise notice '[재고0] T6 %  기대 % %%  관측 % %%', v_label, v_exp, v_obs;

    if abs(v_obs - v_exp) > c_tol then
      v_fail := v_fail || format('재고0 T6 %s: 기대 %s%% / 관측 %s%%  ', v_label, v_exp, v_obs);
    end if;
  end loop;

  if v_fail <> '' then
    raise exception '재고 0 흡수 검증 실패 (허용 오차 ±% 퍼센트포인트): %', c_tol, v_fail
      using errcode = 'P0001';
  end if;

  raise notice '✅ gacha_simulation: 티어 6종 × %회 + 재고 0 흡수(재분배 없음) 모두 통과', c_n;
end $$;

-- 결과표 (tier 0 = 재고 0 검증 구간)
select tier, slot, label, expected_pct, observed_pct, diff_pp, ok
  from gacha_sim_result
 order by tier, slot;

rollback;
