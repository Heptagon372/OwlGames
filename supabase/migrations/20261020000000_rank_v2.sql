-- =====================================================================
-- OWL GAMES — 랭크 v2: 30단계 · 챌린저 보너스 티켓 · 뽑기 11티어 (DECISIONS §5-47)
--
--   사용자 요청
--     · 랭크 17 → 30단계. 올라갈수록 간격이 길어지고, 마스터 · 영겁 · 태초 · 정점에서 확 멀어진다.
--     · 챌린저 뒤에도 티켓을 받는다 — 간격은 "정점 → 챌린저" 간격에서 시작해 배수로 늘어난다 (30 + A, 무한).
--     · 뽑기: 한 줄 안에서 늘 아래 등수(꽝 쪽)가 더 높다. 1등 확률은 T1~T6 그대로, 뒤에 티어를 붙이고
--       챌린저 1등은 5%. 재고 0 인 상품의 확률은 꽝으로 가고 관리자 화면에 보인다.
--
--   바뀌는 것
--     1) 랭크 = **누적 포인트**로 정한다 (rank_from_points). 레벨로는 30단계를 벌려 놓을 칸이 모자라서 떼었다.
--        레벨 곡선은 base 50 · step 9 로 바꿔 Lv 100 = 49,500P = 챌린저 로 맞춘다 (예전에도 챌린저 = Lv 100).
--     2) challenger_bonus_count — 챌린저 이후 보너스 티켓 수 (간격 8,800 × 1.25ⁿ, 100P 단위 올림)
--     3) tier_from_rank — 11티어 (마스터·영겁·태초·정점·챌린저에서 티어가 바뀐다)
--     4) gacha_table 11티어, admin_set_config 가 "아래 등수 ≥ 윗 등수 · 꽝이 가장 크다" 를 검사
--     5) submit_game_session_core — 20261007_points_v2 본문 그대로 + 랭크 식 · 보너스 티켓 · 레스토랑 ∞ 26단계
--        (래퍼 submit_game_session 은 손대지 않는다 — DECISIONS §5-27)
--     6) admin_grant_tickets(20261015) · board_stats(init) 의 랭크 상한 16 → 29
--     7) 기존 유저: 레벨·랭크를 새 식으로 다시 계산하고, 새 랭크까지 빠진 랭크 티켓 · 보너스 티켓을 채운다
--        (이미 받은 티켓은 그대로 — 예전 earned_rank_idx 도 새 tier_from_rank 로 거의 같은 티어가 나온다)
--
--   TS 사본: lib/rank.ts (RANKS[].minPoints · tierFromRank · challengerBonusCount) · lib/config.ts (gacha_table · level_curve)
--   검증: tests/rank.test.ts 가 이 파일의 숫자 표를 읽어 TS 와 대조한다.
-- =====================================================================


-- ===== 1. 제약 =======================================================
alter table public.profiles drop constraint if exists profiles_rank_idx_check;
alter table public.profiles add  constraint profiles_rank_idx_check check (rank_idx between 0 and 29);

-- 보너스 티켓은 30, 31, … 로 끝이 없다
alter table public.tickets drop constraint if exists tickets_earned_rank_idx_check;
alter table public.tickets add  constraint tickets_earned_rank_idx_check check (earned_rank_idx >= 1);

alter table public.draws drop constraint if exists draws_rank_idx_check;
alter table public.draws add  constraint draws_rank_idx_check check (rank_idx between 0 and 29);
alter table public.draws drop constraint if exists draws_tier_check;
alter table public.draws add  constraint draws_tier_check check (tier between 1 and 11);


-- ===== 2. 레벨 곡선 — Lv 100 = 49,500P = 챌린저 ========================
--   Lv L → L+1 = 50 + 9L · 누적 cum(L) = 50(L−1) + 9(L−1)L/2
insert into public.app_config (key, value) values ('level_curve', '{"base":50,"step":9}'::jsonb)
on conflict (key) do update set value = excluded.value;


-- ===== 3. 랭크 = 누적 포인트 ===========================================
--   간격(P): 나무→미스릴 100 부터 +20 씩 (100 … 340)
--            마스터 700 (×2.1) → 불멸까지 +40 (740 … 900)
--            영겁 1,840 (×2.0) → 신화까지 +80 (1,920 … 2,080)
--            태초 4,000 (×1.9) → 극점까지 +100 (4,100 … 4,300)
--            정점 8,600 (×2.0) → 챌린저 8,800
--   idx:  0 나무 · 1 돌 · 2 아이언 · 3 브론즈 · 4 실버 · 5 골드 · 6 플래티넘 · 7 에메랄드 · 8 다이아몬드 · 9 루비
--        10 사파이어 · 11 흑요석 · 12 아다만티움 · 13 미스릴 · 14 마스터 · 15 그랜드마스터 · 16 엘리트 · 17 초월자
--        18 불멸자 · 19 불멸 · 20 영겁 · 21 전설 · 22 신성 · 23 신화 · 24 태초 · 25 성좌 · 26 전상 · 27 극점
--        28 정점 · 29 챌린저
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
           1900, 2200, 2520, 2860, 3560, 4300, 5080, 5900, 6760, 7660,
           9500, 11420, 13420, 15500, 19500, 23600, 27800, 32100, 40700, 49500
         ]) with ordinality as t(min_points, idx)
   where t.min_points <= greatest(coalesce(p, 0), 0)
$$;

comment on function public.rank_from_level(int)
  is '20261020_rank_v2 부터 안 쓴다 — 랭크는 rank_from_points(누적 포인트)';

-- 챌린저(49,500P) 뒤 보너스 티켓 수.
--   n번째 간격 = 앞 간격 × 1.25 를 100P 단위로 올림, 첫 앞 간격 = 정점 → 챌린저 8,800
--   → +11,000(60,500) · +13,800(74,300) · +17,300(91,600) · +21,700(113,300) …
--   정수로만 계산한다 (TS 사본 lib/rank.ts 의 challengerBonusCount 와 한 자리도 다르면 안 된다)
create or replace function public.challenger_bonus_count(p int)
returns int
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
declare
  v_p   bigint := greatest(coalesce(p, 0), 0);
  v_iv  bigint := 8800;
  v_thr bigint := 49500;
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

-- 순수 계산이라 누구나 불러도 된다 (rank_from_level 과 같은 취급)
grant execute on function public.rank_from_points(int) to anon, authenticated;
grant execute on function public.challenger_bonus_count(int) to anon, authenticated;


-- ===== 4. 뽑기 티어 (11) =============================================
--   T1 나무~아이언 · T2 브론즈~골드 · T3 플래티넘~다이아몬드 · T4 루비~흑요석 · T5 아다만티움·미스릴
--   T6 마스터~엘리트 · T7 초월자~불멸 · T8 영겁~신화 · T9 태초~극점 · T10 정점 · T11 챌린저(+ 보너스)
--   티어 경계를 "확 멀어지는" 랭크(마스터·영겁·태초·정점)에 맞췄다.
create or replace function public.tier_from_rank(r int)
returns int
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select case
    when r is null then 1
    when r >= 29 then 11
    when r >= 28 then 10
    when r >= 24 then 9
    when r >= 20 then 8
    when r >= 17 then 7
    when r >= 14 then 6
    when r >= 12 then 5
    when r >=  9 then 4
    when r >=  6 then 3
    when r >=  3 then 2
    else 1
  end
$$;


-- ===== 5. 확률표 (11티어) ============================================
--   [1등, 2등, 3등, 4등, 5등, 6등] · 남는 몫이 꽝
--   1등은 T1~T6 을 운영 값 그대로(0.1 · 0.5 · 1 · 1.5 · 2 · 2.5), 0.5 씩 이어 붙여 T11(챌린저) = 5%.
--   2~6등은 T1 [1, 3, 6, 15, 25] → T11 [7, 10, 14, 18, 21] 사이를 티어마다 같은 폭으로 옮긴다.
--   → 꽝은 T1 49.9% 에서 티어마다 2.5%p 씩 줄어 T11 25%. 모든 줄이 1등 < 2등 < … < 6등 < 꽝.
--
--     티어   1등   2등   3등   4등    5등    6등    꽝
--     T1     0.1   1     3     6     15     25     49.9
--     T2     0.5   1.6   3.7   6.8   15.3   24.6   47.5
--     T3     1     2.2   4.4   7.6   15.6   24.2   45
--     T4     1.5   2.8   5.1   8.4   15.9   23.8   42.5
--     T5     2     3.4   5.8   9.2   16.2   23.4   40
--     T6     2.5   4     6.5   10    16.5   23     37.5
--     T7     3     4.6   7.2   10.8  16.8   22.6   35
--     T8     3.5   5.2   7.9   11.6  17.1   22.2   32.5
--     T9     4     5.8   8.6   12.4  17.4   21.8   30
--     T10    4.5   6.4   9.3   13.2  17.7   21.4   27.5
--     T11    5     7     10    14    18     21     25
--
--   재고 0 인 등수는 gacha_pick 이 꽝으로 돌린다(바뀌지 않음). 관리자 화면이 "실제 꽝"을 따로 보여 준다.
insert into public.app_config (key, value) values
  ('gacha_table', jsonb_build_object(
     '1',  jsonb_build_array(0.1, 1,   3,   6,    15,   25),
     '2',  jsonb_build_array(0.5, 1.6, 3.7, 6.8,  15.3, 24.6),
     '3',  jsonb_build_array(1,   2.2, 4.4, 7.6,  15.6, 24.2),
     '4',  jsonb_build_array(1.5, 2.8, 5.1, 8.4,  15.9, 23.8),
     '5',  jsonb_build_array(2,   3.4, 5.8, 9.2,  16.2, 23.4),
     '6',  jsonb_build_array(2.5, 4,   6.5, 10,   16.5, 23),
     '7',  jsonb_build_array(3,   4.6, 7.2, 10.8, 16.8, 22.6),
     '8',  jsonb_build_array(3.5, 5.2, 7.9, 11.6, 17.1, 22.2),
     '9',  jsonb_build_array(4,   5.8, 8.6, 12.4, 17.4, 21.8),
     '10', jsonb_build_array(4.5, 6.4, 9.3, 13.2, 17.7, 21.4),
     '11', jsonb_build_array(5,   7,   10,  14,   18,   21)
   ))
on conflict (key) do update set value = excluded.value;


-- ===== 6. admin_set_config — 20261010_gacha_admin 본문 + 확률표 검사만 바꿈 =====
--   확률표: 티어 1~11 이 다 있어야 하고, 한 줄 안에서 1등 ≤ 2등 ≤ … ≤ 마지막 등수 ≤ 꽝.
create or replace function public.admin_set_config(p_key text, p_value jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_num  numeric;
  v_prev numeric;
  v_row  jsonb;
  v_sum  numeric;
  v_len  int;
  v_max  int;
  v_item jsonb;
  v_pat  text;
begin
  if not public.is_admin() then
    raise exception '권한이 없어요' using errcode = 'P0001';
  end if;
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    raise exception '값이 비어 있어요' using errcode = 'P0001';
  end if;

  if p_key = 'open_hours' then
    if jsonb_typeof(p_value) <> 'object'
       or (p_value ->> 'start') !~ '^[0-2][0-9]:[0-5][0-9]$'
       or (p_value ->> 'end')   !~ '^[0-2][0-9]:[0-5][0-9]$'
       or coalesce(p_value ->> 'tz', '') = '' then
      raise exception '운영시간 형식이 올바르지 않아요 (HH:MM)' using errcode = 'P0001';
    end if;

  elsif p_key = 'game_k' then
    if jsonb_typeof(p_value) <> 'object' then
      raise exception 'K값 형식이 올바르지 않아요' using errcode = 'P0001';
    end if;
    -- 지금 게임 키가 하나라도 빠지면 그 게임 제출이 통째로 실패한다 (내린 게임 키는 그대로 둬도 된다)
    for v_item in select jsonb_array_elements(to_jsonb(array['flight','survive','owlis','chef'])) loop
      v_num := (p_value ->> (v_item #>> '{}'))::numeric;
      if v_num is null or v_num <= 0 or v_num > 1000 then
        raise exception 'K값은 1~1000 사이여야 해요 (%)', v_item #>> '{}' using errcode = 'P0001';
      end if;
    end loop;

  elsif p_key = 'game_points' then
    if jsonb_typeof(p_value) <> 'object' or jsonb_typeof(p_value -> 'per_min') <> 'object' then
      raise exception '포인트 설정 형식이 올바르지 않아요' using errcode = 'P0001';
    end if;
    v_num := (p_value ->> 'base')::numeric;
    if v_num is null or v_num < 0 or v_num > 10000 then
      raise exception '기본 포인트는 0~10000 사이여야 해요' using errcode = 'P0001';
    end if;
    for v_item in select jsonb_array_elements(to_jsonb(array['flight','survive','owlis','chef'])) loop
      v_num := (p_value -> 'per_min' ->> (v_item #>> '{}'))::numeric;
      if v_num is null or v_num < 0 or v_num > 10000 then
        raise exception '분당 포인트는 0~10000 사이여야 해요 (%)', v_item #>> '{}' using errcode = 'P0001';
      end if;
    end loop;

  elsif p_key = 'owl_energy' then
    if jsonb_typeof(p_value) <> 'object' then
      raise exception '아울 에너지 형식이 올바르지 않아요' using errcode = 'P0001';
    end if;
    -- 일부 키만 보내도 되도록 기존 값 위에 덮어쓴다 (드롭 조건 같은 걸 실수로 날리지 않게)
    p_value := coalesce(public.cfg('owl_energy'), '{}'::jsonb) || p_value;

    if coalesce((p_value ->> 'regen_min')::numeric, 0) <= 0
       or coalesce((p_value ->> 'regen_min')::numeric, 0) > 240 then
      raise exception '충전 간격은 1~240분이어야 해요' using errcode = 'P0001';
    end if;
    if coalesce((p_value ->> 'cap')::numeric, 0) < 1
       or coalesce((p_value ->> 'cap')::numeric, 0) > 50 then
      raise exception '자동 충전 상한은 1~50이어야 해요' using errcode = 'P0001';
    end if;
    if coalesce((p_value ->> 'hard_cap')::numeric, 0) < (p_value ->> 'cap')::numeric
       or coalesce((p_value ->> 'hard_cap')::numeric, 0) > 99 then
      raise exception '보관 상한은 자동 충전 상한 이상 99 이하여야 해요' using errcode = 'P0001';
    end if;
    if coalesce((p_value ->> 'cost')::numeric, -1) < 0
       or coalesce((p_value ->> 'cost')::numeric, -1) > 10 then
      raise exception '게임 비용은 0~10이어야 해요' using errcode = 'P0001';
    end if;
    if coalesce((p_value ->> 'drop_daily_cap')::numeric, 0) < 0
       or coalesce((p_value ->> 'drop_daily_cap')::numeric, 0) > 50 then
      raise exception '하루 드롭 상한은 0~50이어야 해요' using errcode = 'P0001';
    end if;

  elsif p_key = 'master_admin' then
    if jsonb_typeof(p_value -> 'student_ids') <> 'array' then
      raise exception '마스터 관리자 학번 목록이 필요해요' using errcode = 'P0001';
    end if;
    v_pat := coalesce(public.cfg('student_id_pattern') #>> '{}', '^[0-9]{9}$');
    for v_item in select jsonb_array_elements(p_value -> 'student_ids') loop
      if jsonb_typeof(v_item) <> 'string' or (v_item #>> '{}') !~ v_pat then
        raise exception '학번 형식이 올바르지 않아요: %', v_item #>> '{}' using errcode = 'P0001';
      end if;
    end loop;

  elsif p_key = 'booth_location' then
    -- 화면·안내가 읽는 키는 building · floor · spot (예전 검사는 쓰지 않는 place 를 요구해서 저장이 안 됐다)
    if jsonb_typeof(p_value) <> 'object'
       or coalesce(p_value ->> 'building', '') = ''
       or coalesce(p_value ->> 'spot', '') = '' then
      raise exception '부스 건물과 위치가 필요해요' using errcode = 'P0001';
    end if;

  elsif p_key = 'redeem_code_ttl_min' then
    v_num := (p_value #>> '{}')::numeric;
    if v_num is null or v_num < 1 or v_num > 240 then
      raise exception '코드 유효시간은 1~240분이어야 해요' using errcode = 'P0001';
    end if;

  elsif p_key = 'gacha_table' then
    -- 행사 중에 상위 상품이 너무 빨리 나가면 화면에서 바로 낮출 수 있어야 한다 (§5-13)
    if jsonb_typeof(p_value) <> 'object' then
      raise exception '확률표 형식이 올바르지 않아요' using errcode = 'P0001';
    end if;
    select count(*) into v_max from public.prizes;
    v_len := null;

    -- 티어가 하나라도 비면 그 티어 뽑기가 통째로 실패한다 (T1~T11, tier_from_rank 와 같은 범위)
    for t in 1..11 loop
      v_row := p_value -> (t::text);
      if v_row is null or jsonb_typeof(v_row) <> 'array' then
        raise exception 'T% 확률이 없어요', t using errcode = 'P0001';
      end if;

      if v_len is null then
        v_len := jsonb_array_length(v_row);
        if v_len < 1 or v_len > v_max then
          raise exception '등수 개수(%)가 상품 수(%)와 맞지 않아요', v_len, v_max using errcode = 'P0001';
        end if;
      elsif jsonb_array_length(v_row) <> v_len then
        raise exception '티어마다 등수 개수가 달라요' using errcode = 'P0001';
      end if;

      v_sum  := 0;
      v_prev := 0;
      for k in 1..v_len loop
        v_num := (v_row ->> (k - 1))::numeric;
        if v_num is null or v_num < 0 or v_num > 100 then
          raise exception '확률은 0~100 사이여야 해요 (T% %등)', t, k using errcode = 'P0001';
        end if;
        -- 아래 등수(상품이 흔한 쪽)가 늘 더 높다 (rank_v2)
        if v_num < v_prev then
          raise exception 'T% %등(%)이 %등(%)보다 낮아요 — 아래 등수일수록 확률이 같거나 높아야 해요',
            t, k, v_num || '%', k - 1, v_prev || '%' using errcode = 'P0001';
        end if;
        v_prev := v_num;
        v_sum  := v_sum + v_num;
      end loop;
      -- 남는 몫이 꽝이다. 100을 넘으면 꽝이 음수가 된다
      if v_sum > 100 then
        raise exception 'T% 당첨 확률 합이 % 예요 — 100%% 를 넘을 수 없어요', t, v_sum || '%' using errcode = 'P0001';
      end if;
      -- 꽝이 가장 커야 한다
      if 100 - v_sum < v_prev then
        raise exception 'T% 꽝(%)이 %등(%)보다 낮아요 — 꽝이 가장 커야 해요', t, (100 - v_sum) || '%', v_len, v_prev || '%'
          using errcode = 'P0001';
      end if;
    end loop;

  else
    raise exception '화면에서 바꿀 수 없는 설정이에요 (%)', p_key using errcode = 'P0001';
  end if;

  insert into public.app_config (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;

  return jsonb_build_object('status', 'ok', 'key', p_key, 'value', p_value);
end;
$$;

revoke execute on function public.admin_set_config(text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_set_config(text, jsonb) to authenticated;


-- ===== 7. admin_grant_tickets — 20261015_admin_tickets 본문 + 랭크 범위 1..29 · 티어 1~11 =====
create or replace function public.admin_grant_tickets(p_user_id uuid, p_count int, p_tier int, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin  uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_name   text;
  v_rank   int;
  v_unused int;
begin
  if not public.is_admin() then
    raise exception '권한이 없어요' using errcode = 'P0001';
  end if;
  if p_user_id = v_admin then
    raise exception '본인에게는 지급할 수 없어요 (다른 관리자에게 부탁하세요)' using errcode = 'P0001';
  end if;
  if p_count is null or p_count < 1 or p_count > 10 then
    raise exception '지급 장수는 1~10장이에요' using errcode = 'P0001';
  end if;
  if v_reason = '' or char_length(v_reason) > 40 then
    raise exception '지급 사유를 적어주세요 (40자 이내)' using errcode = 'P0001';
  end if;

  -- 티어의 가장 낮은 랭크 (랭크 0 은 티켓이 없으므로 1부터)
  select min(r) into v_rank
    from generate_series(1, 29) r
   where public.tier_from_rank(r) = p_tier;
  if v_rank is null then
    raise exception '티어는 1~11이에요' using errcode = 'P0001';
  end if;

  select name into v_name from public.profiles where id = p_user_id for update;
  if not found then
    raise exception '사용자를 찾을 수 없어요' using errcode = 'P0001';
  end if;

  insert into public.tickets (user_id, earned_rank_idx, grant_seq, granted_by, grant_reason)
  select p_user_id, v_rank, nextval('public.tickets_grant_seq'), v_admin, v_reason
    from generate_series(1, p_count);

  select count(*) into v_unused
    from public.tickets where user_id = p_user_id and status = 'unused';

  perform public.audit_write('ticket.grant', p_user_id, v_name,
           jsonb_build_object('count', p_count, 'tier', p_tier, 'reason', v_reason));

  return jsonb_build_object('status', 'ok', 'granted', p_count, 'tier', p_tier, 'unused', v_unused);
end;
$$;

revoke execute on function public.admin_grant_tickets(uuid, int, int, text) from public, anon, authenticated;
grant execute on function public.admin_grant_tickets(uuid, int, int, text) to authenticated;  -- 내부에서 is_admin()


-- ===== 8. 전광판 — 챌린저 = 29 (init 본문 그대로) =======================
create or replace function public.board_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz           text := coalesce(public.cfg('open_hours') ->> 'tz', 'Asia/Seoul');
  v_from         timestamptz;
  v_to           timestamptz;
  v_participants int;
  v_plays        int;
  v_challengers  int;
  v_draws        int;
begin
  -- "오늘" = 설정된 타임존(기본 Asia/Seoul) 기준 날짜
  v_from := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_to   := v_from + interval '1 day';

  select count(distinct user_id), count(*)
    into v_participants, v_plays
    from public.game_sessions
   where status = 'submitted' and submitted_at >= v_from and submitted_at < v_to;

  select count(*) into v_challengers from public.profiles where rank_idx >= 29;

  select count(*) into v_draws
    from public.draws where drawn_at >= v_from and drawn_at < v_to;

  return jsonb_build_object(
    'participants', coalesce(v_participants, 0),
    'plays',        coalesce(v_plays, 0),
    'challengers',  coalesce(v_challengers, 0),
    'draws',        coalesce(v_draws, 0)
  );
end;
$$;


-- ===== 9. submit_game_session_core — 20261007_points_v2 본문 + rank_v2 =====
--   바뀐 곳은 세 군데뿐이다 (나머지는 한 글자도 같다):
--     · v_rank := greatest(v_p.rank_idx, public.rank_from_points(v_total))
--     · 랭크업 블록 뒤 "챌린저 이후 보너스 티켓" — tickets_gained 에 같이 센다
--     · 레스토랑 개인 기록의 ∞ 조건 v_c_stage >= 16 → 26 (DECISIONS §6 에 적혀 있던 것)
create or replace function public.submit_game_session_core(
  p_session_id uuid,
  p_raw_score  int,
  p_meta       jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_s        public.game_sessions%rowtype;
  v_p        public.profiles%rowtype;
  v_limits   jsonb;
  v_min      numeric;
  v_max      numeric;
  v_max_raw  numeric;
  v_elapsed  numeric;
  v_last     timestamptz;
  v_reason   text;
  v_meta     jsonb := coalesce(p_meta, '{}'::jsonb);
  v_k        numeric;
  v_points   int;
  v_total    int;
  v_level    int;
  v_rank     int;
  v_gained   int := 0;
  v_bonus    int := 0;   -- 챌린저 이후 보너스 티켓 (rank_v2)
  -- ↓ 아울러닝(flight) 전용 (20260925_owl_energy 와 동일)
  v_raw      int;        -- 실제로 채점에 쓰는 원점수 (클라이언트 값 또는 서버 재계산 값)
  v_f_dist   numeric;    -- distance_m
  v_f_dur    numeric;    -- duration_s (클라이언트 주장 — 검증용으로만 쓰고 채점엔 안 씀)
  v_f_pass   numeric;    -- pass_count
  v_f_near   numeric;    -- near_miss
  v_f_items  numeric;    -- items
  v_f_iscore numeric;    -- item_score
  v_f_mult   numeric;    -- combo_mult_avg (1.0~2.5 로 클램프)
  v_f_energy numeric;    -- energy_left (flight_raw 가 0~180 으로 클램프)
  v_f_spec   numeric;    -- special_cleared (0~10 으로 클램프)
  v_f_sbonus numeric;    -- special_bonus_score (특수구간 배율로 더 번 점수)
  v_f_raw    numeric;    -- 서버가 메타로 재계산한 원점수
  -- ↓ 아울 로직(logic) 전용 (신규, GDD OWLLOGIC §7.1/§7.3)
  v_l_solved     numeric;  -- 해결 수
  v_l_optimal    numeric;  -- 최소 부품으로 해결한 횟수
  v_l_tier_max   numeric;  -- 도달 티어 (1~5)
  v_l_hints      numeric;  -- 힌트 사용 횟수
  v_l_wrong      numeric;  -- 오답 제출 횟수
  v_l_avg_ms     numeric;  -- 평균 풀이 시간(ms)
  v_l_time_left  numeric;  -- 남은 시간(초)
  v_l_combo_mult numeric;  -- combo_mult_avg (1.0~2.4 로 클램프)
  v_l_tier_mult  numeric;  -- tier_mult_avg (1.0~2.4 로 클램프)
  v_l_overdrive  numeric;  -- overdrive_bonus_score (오버드라이브 ×2 보너스)
  v_l_dur        numeric;  -- duration_s (클라이언트 주장 — 검증용으로만 씀)
  v_l_raw        numeric;  -- 서버가 메타로 재계산한 원점수
  -- ↓ 아울 서바이버즈(survive) 전용 (v3 — 한 런에서 1 → 15 → 무한)
  v_sv_stage      int;      -- 도달한 단계 (1~)
  v_sv_cleared    boolean;  -- 십오각형(최종 보스)을 잡았는가 ⇔ 16단계 이상
  v_sv_bosses     numeric;  -- 클라이언트가 보낸 보스 처치 수 (대조용)
  v_sv_boss_need  int;      -- 도달 단계로 계산한 보스 처치 수 (채점엔 이 값을 쓴다)
  v_sv_kills      numeric;  -- 처치 수
  v_sv_level      numeric;  -- 도달 레벨 (≤60)
  v_sv_evo        numeric;  -- 진화 수 (≤12)
  v_sv_obst       numeric;  -- 부순 장애물 수
  v_sv_dmg        numeric;  -- 피격 횟수 (0 이면 무피격 보너스)
  v_sv_rev        numeric;  -- 부활 사용 횟수
  v_sv_dur        numeric;  -- duration_s (클라이언트 주장 — 대조용)
  v_sv_guard      jsonb;    -- app_config.game_guards.survive
  v_sv_survived   numeric;  -- 재계산에 쓰는 생존 시간
  v_sv_raw        numeric;  -- 서버가 메타로 재계산한 원점수
  -- ↓ 스테이지 해금 (모든 게임 공통 응답 키)
  v_meta_unlock int;
  v_new_unlock  int;
  -- ↓ 나이트 타이퍼(typer) 전용 (신규)
  v_t_hits   numeric;    -- meta.hits (파괴한 단어 수)
  v_t_miss   numeric;    -- meta.misses (바닥에 닿은 단어 수)
  v_t_combo  numeric;    -- meta.max_combo
  v_t_fire   numeric;    -- meta.firewall (0~100)
  v_t_dur    numeric;    -- meta.duration_sec (클라이언트 주장 — 대조용)
  v_t_cap    numeric;    -- 메타로 계산한 원점수 상한
  -- ↓ 아울리스(owlis) 전용 (OWLIS_GDD §24~§26, games/owlis/engine/score.ts 와 같은 식)
  v_o_pieces  numeric;  -- 굳힌 블록 수 (두 칸짜리)
  v_o_cleared numeric;  -- 터뜨린 색 블록 수
  v_o_chains  numeric;  -- 연쇄가 난 횟수
  v_o_maxc    numeric;  -- 최대 연쇄
  v_o_ko      numeric;  -- AI KO
  v_o_ctr     numeric;  -- COUNTER
  v_o_em      numeric;  -- EMERGENCY CLEAR
  v_o_fev     numeric;  -- OWL FEVER
  v_o_lv      numeric;  -- 도달한 최고 내부 난이도 (level_max)
  v_o_clear   numeric;  -- 블록 점수 합 (clear_score, 클라이언트 주장)
  v_o_dur     numeric;  -- duration_s (클라이언트 주장 — 대조용)
  v_o_guard   jsonb;    -- app_config.game_guards.owlis
  v_o_k       numeric;  -- max(1, 최대 연쇄)
  v_o_cmult   numeric;  -- 최대 연쇄의 점수 배율
  v_o_amult   numeric;  -- 최고 난이도의 AI LEVEL 배율 × 피버 1.5
  v_o_cap     numeric;  -- 메타로 만들 수 있는 블록 점수 상한
  v_o_surv    numeric;  -- 재계산에 쓰는 생존 시간
  v_o_raw     numeric;  -- 서버가 메타로 재계산한 원점수
  v_o_rec     jsonb;    -- profiles.meta.owlis_record
  -- ↓ 아울 레스토랑(chef) 전용 (OWLRESTAURANT_GDD §29 · §32, games/chef/engine/score.ts 와 같은 식)
  v_c_raw     numeric;  -- 서버가 메타로 재계산한 원점수 (chef_raw)
  v_c_stage   int;      -- 끝낸 주문 수로 계산한 도달 단계 (16 = ∞)
  v_c_rec     jsonb;    -- profiles.meta.chef_record
  -- ↓ 아울 에너지 전용 (기존 + logic/survive 조건 확장)
  v_ecfg     jsonb;      -- app_config.owl_energy
  v_e_hard   int;        -- hard_cap
  v_e_dphase numeric;    -- drop_min_phase (flight 전용)
  v_e_ddist  numeric;    -- drop_min_distance (flight 전용)
  v_e_dcap   int;        -- drop_daily_cap
  v_e_tz     text;       -- "오늘" 판정 타임존 (기본 Asia/Seoul)
  v_e_day0   timestamptz;
  v_e_day1   timestamptz;
  v_e_flag   boolean;    -- meta.owl_energy_found
  v_e_phase  numeric;    -- meta.phase_max (flight 전용)
  v_e_ok     boolean;    -- 게임별 드랍 조건을 전부 만족했는가
  v_e_today  int;        -- 오늘 이미 받은 인게임 드랍 수
  v_e_gained int := 0;   -- 이번 제출로 드랍을 받았는가 (0|1)
  v_e_final  int;        -- 이번 제출 이후 최종 에너지
begin
  if v_uid is null then
    raise exception '로그인이 필요해요' using errcode = 'P0001';
  end if;

  -- 아울 에너지 설정 (rejected 경로에서도 owl_energy 키를 채워야 하므로 먼저 읽어둔다)
  v_ecfg     := coalesce(public.cfg('owl_energy'), '{}'::jsonb);
  v_e_hard   := coalesce((v_ecfg ->> 'hard_cap')::int, 20);
  v_e_dphase := coalesce((v_ecfg ->> 'drop_min_phase')::numeric, 3);
  v_e_ddist  := coalesce((v_ecfg ->> 'drop_min_distance')::numeric, 900);
  v_e_dcap   := coalesce((v_ecfg ->> 'drop_daily_cap')::int, 5);
  v_e_tz     := coalesce(public.cfg('open_hours') ->> 'tz', 'Asia/Seoul');
  v_e_day0   := date_trunc('day', now() at time zone v_e_tz) at time zone v_e_tz;
  v_e_day1   := v_e_day0 + interval '1 day';

  -- 세션 잠금 + 소유·상태 확인
  select * into v_s from public.game_sessions where id = p_session_id for update;
  if not found or v_s.user_id <> v_uid or v_s.status <> 'active' then
    raise exception '유효하지 않은 게임 세션이에요' using errcode = 'P0001';
  end if;

  -- meta 정리 (객체가 아니면 감싸고, 과도하게 크면 버린다)
  if jsonb_typeof(v_meta) <> 'object' then
    v_meta := jsonb_build_object('client_meta', v_meta);
  end if;
  if octet_length(v_meta::text) > 8192 then
    v_meta := jsonb_build_object('meta_dropped', 'too_large');
  end if;

  v_limits  := coalesce(public.cfg('game_limits') -> (v_s.game::text), '{}'::jsonb);
  v_min     := coalesce((v_limits ->> 'min_sec')::numeric, 0);
  v_max     := coalesce((v_limits ->> 'max_sec')::numeric, 600);
  v_max_raw := (v_limits ->> 'max_raw')::numeric;   -- 선택 키(원점수 상한), 없으면 검사 안 함
  v_elapsed := extract(epoch from (now() - v_s.started_at));
  v_meta    := v_meta || jsonb_build_object('elapsed_sec', round(v_elapsed, 2));

  -- max_sec + 60초를 넘긴 세션은 방치 세션으로 간주 (expire_stale 대상)
  if v_elapsed > v_max + 60 then
    raise exception '유효하지 않은 게임 세션이에요' using errcode = 'P0001';
  end if;

  -- 직전 제출 시각 (레이트리밋)
  select max(submitted_at) into v_last
    from public.game_sessions
   where user_id = v_uid and status = 'submitted';

  if p_raw_score is null or p_raw_score < 0 then
    v_reason := '점수가 올바르지 않아요';
  elsif v_max_raw is not null and p_raw_score > v_max_raw then
    v_reason := '점수가 비정상적이에요';
  elsif v_elapsed < v_min then
    v_reason := '플레이 시간이 너무 짧아요';
  elsif v_elapsed > v_max then
    v_reason := '플레이 시간이 초과됐어요';
  elsif v_last is not null and extract(epoch from (now() - v_last)) < v_min then
    v_reason := '제출 간격이 너무 짧아요';
  end if;

  -- ---------------------------------------------------------------
  -- 게임별 메타 검증 (owlrunning §3.a 그대로 + logic/survive 신규)
  --   원칙: 시간은 "무조건" 서버 기준(now() - started_at, = v_elapsed)을 쓴다.
  --         클라이언트의 duration_s 는 서버 시간과 맞는지 대조하는 용도로만 쓴다.
  --   제네릭 검증(시간 범위·레이트리밋)이 이미 걸렸으면 그 사유를 유지한다.
  -- ---------------------------------------------------------------
  if v_s.game = 'flight' then
    v_f_dist   := public.meta_num(v_meta, 'distance_m');
    v_f_dur    := public.meta_num(v_meta, 'duration_s');
    v_f_pass   := greatest(0, coalesce(public.meta_num(v_meta, 'pass_count'),      0));
    v_f_near   := greatest(0, coalesce(public.meta_num(v_meta, 'near_miss'),       0));
    v_f_items  := greatest(0, coalesce(public.meta_num(v_meta, 'items'),           0));
    v_f_iscore := greatest(0, coalesce(public.meta_num(v_meta, 'item_score'),      0));
    v_f_energy := greatest(0, coalesce(public.meta_num(v_meta, 'energy_left'),     0));
    v_f_spec   := greatest(0, coalesce(public.meta_num(v_meta, 'special_cleared'), 0));
    v_f_sbonus := greatest(0, coalesce(public.meta_num(v_meta, 'special_bonus_score'), 0));
    v_f_mult   :=             coalesce(public.meta_num(v_meta, 'combo_mult_avg'),  1.0);

    -- 아울러닝 2.0: 거부 규칙은 헬퍼 한 곳 (public.flight_reject_reason)
    if v_reason is null then
      v_reason := public.flight_reject_reason(v_meta, v_elapsed);
    end if;

  -- ⚠️ enum 값 사용 제약(파일 머리말 참고): v_s.game 을 'logic'::game_id 와 비교하지 않고
  --    v_s.game::text 를 문자열과 비교한다 (survive 도 동일).
  elsif v_s.game::text = 'logic' then
    v_l_solved     := public.meta_num(v_meta, 'solved');
    v_l_optimal    := coalesce(public.meta_num(v_meta, 'optimal'), 0);
    v_l_tier_max   := coalesce(public.meta_num(v_meta, 'tier_max'), 0);
    v_l_hints      := coalesce(public.meta_num(v_meta, 'hints'), 0);
    v_l_wrong      := coalesce(public.meta_num(v_meta, 'wrong_submits'), 0);
    v_l_avg_ms     := public.meta_num(v_meta, 'avg_solve_ms');
    v_l_time_left  := coalesce(public.meta_num(v_meta, 'time_left'), 0);
    v_l_combo_mult := coalesce(public.meta_num(v_meta, 'combo_mult_avg'), 1.0);
    v_l_tier_mult  := coalesce(public.meta_num(v_meta, 'tier_mult_avg'), 1.0);
    v_l_overdrive  := coalesce(public.meta_num(v_meta, 'overdrive_bonus_score'), 0);
    v_l_dur        := public.meta_num(v_meta, 'duration_s');

    if v_reason is null then
      if v_l_solved is null or v_l_solved < 0 then
        v_reason := '문제 수가 올바르지 않아요';
      -- 문제당 최소 1.6초 (읽고 배치하는 물리적 하한) — solved/elapsed > 0.6 이면 불가능
      elsif v_l_solved / v_elapsed > 0.6 then
        v_reason := '문제를 푼 속도가 물리적으로 불가능해요';
      elsif v_l_avg_ms is not null and v_l_avg_ms < 1200 then
        v_reason := '풀이 시간이 비정상적으로 짧아요';
      elsif v_l_optimal > v_l_solved then
        v_reason := '최적화 횟수가 해결 수보다 많아요';
      -- 티어 도달 조건: thresholds [0,4,8,13,19] (tier_max 2~5 는 각각 solved 4/8/13/19 필요)
      elsif v_l_tier_max > 5
         or (v_l_tier_max >= 2 and v_l_solved < 4)
         or (v_l_tier_max >= 3 and v_l_solved < 8)
         or (v_l_tier_max >= 4 and v_l_solved < 13)
         or (v_l_tier_max = 5 and v_l_solved < 19) then
        v_reason := '도달 티어가 해결 수와 맞지 않아요';
      elsif v_l_dur is not null and v_l_dur > v_elapsed + 2 then
        v_reason := '플레이 시간이 서버 기록과 맞지 않아요';
      -- GDD §7.3: 정답률 100%(오답 0·힌트 0) + 평균 풀이 2초 미만 + 10문제 이상 → 의심스러운 기록
      elsif v_l_wrong = 0 and v_l_hints = 0
            and v_l_avg_ms is not null and v_l_avg_ms < 2000 and v_l_solved >= 10 then
        v_reason := '비정상적인 기록이에요';
      end if;
    end if;

  -- 🛡️ 아울 서바이버즈 v3 — 한 런 안에서 단계가 오른다. 보스를 잡아야 다음 단계로 간다.
  elsif v_s.game::text = 'survive' then
    v_sv_stage   := coalesce(public.meta_num(v_meta, 'stage'), 0)::int;
    v_sv_cleared := coalesce((v_meta -> 'cleared') = to_jsonb(true), false);
    v_sv_bosses  := coalesce(public.meta_num(v_meta, 'bosses'), 0);
    v_sv_kills   := coalesce(public.meta_num(v_meta, 'kills'), 0);
    v_sv_level   := coalesce(public.meta_num(v_meta, 'level'), 0);
    v_sv_evo     := coalesce(public.meta_num(v_meta, 'evolutions'), 0);
    v_sv_obst    := coalesce(public.meta_num(v_meta, 'obstacles'), 0);
    v_sv_dmg     := coalesce(public.meta_num(v_meta, 'damage_taken'), 0);
    v_sv_rev     := coalesce(public.meta_num(v_meta, 'revives_used'), 0);
    v_sv_dur     := public.meta_num(v_meta, 'duration_s');
    v_sv_guard   := coalesce(public.cfg('game_guards') -> 'survive', '{}'::jsonb);
    v_sv_boss_need := public.survive_bosses_before(greatest(1, v_sv_stage));

    if v_reason is null then
      if v_sv_stage < 1 then
        v_reason := '단계 값이 올바르지 않아요';
      -- 보스 없는 단계는 30초씩 걸린다 — 단계당 15초보다 빨리 오를 수는 없다
      elsif v_elapsed < (v_sv_stage - 1) * coalesce((v_sv_guard ->> 'min_sec_per_stage')::numeric, 15) then
        v_reason := '단계가 너무 빨리 올랐어요';
      -- 보스를 잡아야 다음 단계로 가므로, 도달 단계가 곧 보스 처치 수다
      elsif v_sv_bosses <> v_sv_boss_need then
        v_reason := '보스 처치 수가 단계와 맞지 않아요';
      -- 십오각형을 잡아야 16단계로 간다
      elsif v_sv_cleared <> (v_sv_stage > 15) then
        v_reason := '최종 보스 기록이 단계와 맞지 않아요';
      elsif v_sv_kills > v_elapsed * coalesce((v_sv_guard ->> 'max_kills_per_sec')::numeric, 8) then
        v_reason := '처치 수가 물리적으로 불가능해요';
      elsif v_sv_level > coalesce((v_sv_guard ->> 'max_level')::numeric, 60) then
        v_reason := '레벨이 상한을 넘었어요';
      elsif v_sv_evo > coalesce((v_sv_guard ->> 'max_evolutions')::numeric, 12) then
        v_reason := '진화 수가 상한을 넘었어요';
      elsif v_sv_rev > coalesce((v_sv_guard ->> 'max_revives')::numeric, 2) then
        v_reason := '부활 횟수가 상한을 넘었어요';
      elsif v_sv_dur is not null and v_sv_dur > v_elapsed + 2 then
        v_reason := '플레이 시간이 서버 기록과 맞지 않아요';
      end if;
    end if;

  -- ⌨️ 나이트 타이퍼 (신규) — 블록 스폰 속도와 방화벽 게이지가 서로를 증명한다
  elsif v_s.game::text = 'typer' then
    v_t_hits  :=             public.meta_num(v_meta, 'hits');
    v_t_miss  := greatest(0, coalesce(public.meta_num(v_meta, 'misses'), 0));
    v_t_combo := greatest(0, coalesce(public.meta_num(v_meta, 'max_combo'), 0));
    v_t_fire  :=             public.meta_num(v_meta, 'firewall');
    v_t_dur   :=             public.meta_num(v_meta, 'duration_sec');

    -- meta.hits 가 없으면(예전 클라이언트) 검사할 근거가 없으니 건너뛴다 — 상한도 걸지 않는다
    if v_reason is null and v_t_hits is not null then
      if v_t_hits < 0 then
        v_reason := '파괴 수가 올바르지 않아요';
      -- 블록은 아무리 빨라도 0.6초에 하나씩만 내려온다 (games/typer/TyperGame.tsx 의 SPAWN_MIN).
      -- 화면에 나온 적 없는 단어를 칠 수는 없으므로 파괴+놓침이 스폰 가능 수를 넘으면 조작이다.
      elsif (v_t_hits + v_t_miss) > (v_elapsed / 0.6) + 2 then
        v_reason := '단어 수가 물리적으로 불가능해요';
      elsif v_t_combo > v_t_hits then
        v_reason := '콤보가 파괴 수보다 많아요';
      -- 방화벽은 놓친 단어 하나당 +20%p(상한 100)로만 오른다 — 정확히 일치해야 한다
      elsif v_t_fire is not null and v_t_fire <> least(100, v_t_miss * 20) then
        v_reason := '방화벽 수치가 놓친 수와 맞지 않아요';
      elsif v_t_dur is not null and v_t_dur > v_elapsed + 2 then
        v_reason := '플레이 시간이 서버 기록과 맞지 않아요';
      end if;
    end if;

  -- 🧩 아울리스 — 블록 수가 터뜨린 수를, 연쇄가 블록 수를, 경과시간이 난이도를 증명한다
  elsif v_s.game::text = 'owlis' then
    v_o_pieces  := coalesce(public.meta_num(v_meta, 'pieces'), 0);
    v_o_cleared := coalesce(public.meta_num(v_meta, 'cleared'), 0);
    v_o_chains  := coalesce(public.meta_num(v_meta, 'chains'), 0);
    v_o_maxc    := coalesce(public.meta_num(v_meta, 'max_combo'), 0);
    v_o_ko      := coalesce(public.meta_num(v_meta, 'ko'), 0);
    v_o_ctr     := coalesce(public.meta_num(v_meta, 'counters'), 0);
    v_o_em      := coalesce(public.meta_num(v_meta, 'emergencies'), 0);
    v_o_fev     := coalesce(public.meta_num(v_meta, 'fevers'), 0);
    v_o_lv      := coalesce(public.meta_num(v_meta, 'level_max'), 1);
    v_o_clear   := coalesce(public.meta_num(v_meta, 'clear_score'), 0);
    v_o_dur     := public.meta_num(v_meta, 'duration_s');
    v_o_guard   := coalesce(public.cfg('game_guards') -> 'owlis', '{}'::jsonb);

    if v_reason is null then
      if v_o_pieces < 0 or v_o_cleared < 0 or v_o_chains < 0 or v_o_maxc < 0 or v_o_ko < 0
         or v_o_ctr < 0 or v_o_em < 0 or v_o_fev < 0 or v_o_clear < 0 or v_o_lv < 1 then
        v_reason := '기록 값이 올바르지 않아요';
      -- 블록은 아무리 빨라도 초당 4개 (하드 드롭 연타 + 굳는 연출)
      elsif v_o_pieces > v_elapsed * coalesce((v_o_guard ->> 'max_pieces_per_sec')::numeric, 4) + 5 then
        v_reason := '블록을 놓은 속도가 물리적으로 불가능해요';
      -- 블록 하나는 두 칸 — 놓은 적 없는 색 블록을 터뜨릴 수는 없다
      elsif v_o_cleared > v_o_pieces * 2 then
        v_reason := '터뜨린 블록이 놓은 블록보다 많아요';
      -- 연쇄 한 단계에 최소 4칸이 터진다. 6×12 필드의 연쇄 한계는 19
      elsif v_o_maxc > coalesce((v_o_guard ->> 'max_combo')::numeric, 19) or v_o_maxc * 4 > v_o_cleared then
        v_reason := '연쇄 기록이 올바르지 않아요';
      elsif v_o_chains * 4 > v_o_cleared then
        v_reason := '연쇄 횟수가 터뜨린 블록 수와 맞지 않아요';
      -- 난이도는 초당 (maxUp + timeRamp) 보다 빨리 못 오른다. KO 마다 ko_bump
      elsif v_o_lv > 1 + v_elapsed * coalesce((v_o_guard ->> 'level_per_sec')::numeric, 0.037)
                       + v_o_ko * coalesce((v_o_guard ->> 'ko_bump')::numeric, 0.25) + 0.05 then
        v_reason := 'AI LEVEL 이 너무 빨리 올랐어요';
      elsif v_o_ko > floor(v_elapsed / coalesce((v_o_guard ->> 'ko_min_sec')::numeric, 20)) + 1 then
        v_reason := 'KO 수가 물리적으로 불가능해요';
      elsif v_o_ctr > v_o_chains or v_o_em > v_o_chains or v_o_fev > v_o_chains then
        v_reason := '보너스 기록이 연쇄 수와 맞지 않아요';
      elsif v_o_dur is not null and v_o_dur > v_elapsed + 2 then
        v_reason := '플레이 시간이 서버 기록과 맞지 않아요';
      end if;
    end if;

  -- 🍳 아울 레스토랑 — 거부 규칙은 헬퍼 한 곳 (public.chef_reject_reason)
  elsif v_s.game::text = 'chef' then
    v_c_stage := public.chef_stage(public.meta_num(v_meta, 'orders'), public.meta_num(v_meta, 'courses'));
    if v_reason is null then
      v_reason := public.chef_reject_reason(v_meta, v_elapsed);
    end if;

  -- 🎣🚀 내린 게임 (피싱 헌터 · 아울스페이스) — 시작은 start_game_session 이 막는다.
  --     배포 순간에 열려 있던 세션이 늦게 들어와도 점수를 주지 않는다.
  elsif v_s.game::text in ('phish', 'space') then
    v_reason := coalesce(v_reason, '지금은 플레이할 수 없는 게임이에요');
  end if;

  -- 검증 실패 → rejected 로 "커밋"하고 반환 (예외를 던지지 않는다)
  -- 아울 에너지는 획득 없이(0) 동기화된 현재 값만 함께 돌려준다 — 소모는 start 에서 이미 끝났다.
  -- unlocked_stage 는 이번 제출로 바뀌지 않으므로 현재 값을 그대로 보여준다.
  if v_reason is not null then
    update public.game_sessions
       set status       = 'rejected',
           submitted_at = now(),
           raw_score    = p_raw_score,
           points       = 0,
           meta         = v_meta || jsonb_build_object('reject_reason', v_reason)
     where id = v_s.id;

    perform public.owl_energy_sync(v_uid);
    select * into v_p from public.profiles where id = v_uid;

    perform public.expire_stale();
    return jsonb_build_object(
      'status',            'rejected',
      'reason',            v_reason,
      'raw_score',         p_raw_score,
      'points',            0,
      'total_points',      v_p.total_points,
      'level_before',      v_p.level,
      'level_after',       v_p.level,
      'rank_before',       v_p.rank_idx,
      'rank_after',        v_p.rank_idx,
      'tickets_gained',    0,
      'owl_energy_gained', 0,
      'owl_energy',        v_p.owl_energy,
      'unlocked_stage',    coalesce((v_p.meta ->> 'survive_stage')::int, 0)
    );
  end if;

  -- ---------------------------------------------------------------
  -- 원점수 서버 재계산 (owlrunning §3.b 그대로 + logic/survive 신규)
  --   메타가 "말이 되는" 범위 안이면 거부하지 않고, 원점수만 서버 값으로 바꾼다.
  --   클라이언트 점수가 ±5% 안이면 그대로 쓴다(부동소수점·집계 순서 차이 허용).
  --   벗어나면 서버 값을 채택하고 meta 에 흔적을 남긴다 → /admin 에서 추적 가능.
  -- ---------------------------------------------------------------
  v_raw := p_raw_score;

  if v_s.game = 'flight' then
    -- 아울러닝 2.0: 재계산식은 헬퍼 한 곳 (public.flight_raw — games/flight/engine/score.ts 와 같은 식)
    v_f_dist := greatest(0, coalesce(v_f_dist, 0));
    v_f_raw  := public.flight_raw(v_meta);

    if abs(p_raw_score - v_f_raw) > 0.05 * greatest(v_f_raw, 1) then
      -- int 범위를 넘는 값이 들어와도 캐스팅에서 터지지 않게 잘라준다 (포인트는 어차피 300P 상한)
      v_raw  := greatest(0, least(round(v_f_raw), 2147483647))::int;
      v_meta := v_meta || jsonb_build_object(
                  'raw_adjusted', true,
                  'raw_client',   p_raw_score,
                  'raw_server',   round(v_f_raw, 2)
                );
    end if;

  elsif v_s.game::text = 'logic' then
    v_l_combo_mult := least(2.4, greatest(1.0, coalesce(v_l_combo_mult, 1.0)));
    v_l_tier_mult  := least(2.4, greatest(1.0, coalesce(v_l_tier_mult, 1.0)));
    v_l_solved     := greatest(0, coalesce(v_l_solved, 0));
    v_l_optimal    := greatest(0, coalesce(v_l_optimal, 0));
    v_l_tier_max   := greatest(0, coalesce(v_l_tier_max, 0));
    v_l_time_left  := greatest(0, coalesce(v_l_time_left, 0));
    v_l_hints      := greatest(0, coalesce(v_l_hints, 0));
    v_l_overdrive  := greatest(0, coalesce(v_l_overdrive, 0));

    v_l_raw := v_l_solved * 120 * v_l_combo_mult * v_l_tier_mult
             + least(v_l_optimal, v_l_solved) * 80
             + least(v_l_tier_max, 5) * 200
             + least(v_l_time_left, 180) * 10
             - least(v_l_hints, v_l_solved + 5) * 60
             + least(greatest(v_l_overdrive, 0), 150 * v_l_solved);   -- 오버드라이브 ×2 보너스 상한
    v_l_raw := greatest(v_l_raw, 0);

    if abs(p_raw_score - v_l_raw) > 0.05 * greatest(v_l_raw, 1) then
      v_raw  := greatest(0, least(round(v_l_raw), 2147483647))::int;
      v_meta := v_meta || jsonb_build_object(
                  'raw_adjusted', true,
                  'raw_client',   p_raw_score,
                  'raw_server',   round(v_l_raw, 2)
                );
    end if;

  elsif v_s.game::text = 'survive' then
    -- v3 §11.1: 처치×3 + 생존초×2 + 레벨×40 + 진화×300 + (도달 단계-1)×200
    --           + 보스×800 + 장애물×8 + 무피격 500   (스테이지 배율 없음)
    --   보스 수는 클라이언트 값이 아니라 도달 단계로 계산한 값을 쓴다.
    v_sv_kills := greatest(0, coalesce(v_sv_kills, 0));
    v_sv_level := greatest(0, least(coalesce(v_sv_level, 0), coalesce((v_sv_guard ->> 'max_level')::numeric, 60)));
    v_sv_evo   := greatest(0, least(coalesce(v_sv_evo, 0), coalesce((v_sv_guard ->> 'max_evolutions')::numeric, 12)));
    v_sv_obst  := greatest(0, least(coalesce(v_sv_obst, 0),
                    v_elapsed * coalesce((v_sv_guard ->> 'max_obstacles_per_sec')::numeric, 2)));
    v_sv_dmg   := greatest(0, coalesce(v_sv_dmg, 0));

    -- 생존 시간은 클라이언트 주장과 서버 경과시간 중 짧은 쪽 (부풀리기 불가)
    v_sv_survived := greatest(0, least(coalesce(v_sv_dur, v_elapsed), v_elapsed));

    v_sv_raw := v_sv_kills * 3
              + floor(v_sv_survived) * 2
              + v_sv_level * 40
              + v_sv_evo * 300
              + (greatest(1, v_sv_stage) - 1) * 200
              + v_sv_boss_need * 800
              + floor(v_sv_obst) * 8
              + (case when v_sv_dmg = 0 then 500 else 0 end);
    v_sv_raw := greatest(v_sv_raw, 0);

    if abs(p_raw_score - v_sv_raw) > 0.05 * greatest(v_sv_raw, 1) then
      v_raw  := greatest(0, least(round(v_sv_raw), 2147483647))::int;
      v_meta := v_meta || jsonb_build_object(
                  'raw_adjusted', true,
                  'raw_client',   p_raw_score,
                  'raw_server',   round(v_sv_raw, 2)
                );
    end if;

  elsif v_s.game::text = 'owlis' then
    -- 블록 점수는 연쇄 하나하나를 모르니 **상한만** 건다 (타이퍼와 같은 방식):
    --   상한 = (터뜨린 블록 × 10 × 최대연쇄 배율 + 연쇄 수 × 40 × 최대연쇄²) × 최고 LEVEL 배율 × 피버 1.5
    -- 나머지 항(COUNTER · EMERGENCY · KO · 생존 보너스)은 정확히 다시 계산한다.
    v_o_k := greatest(1, least(v_o_maxc, coalesce((v_o_guard ->> 'max_combo')::numeric, 19)));
    v_o_cmult := case when v_o_k <= 1 then 1.0
                      when v_o_k = 2 then 1.2
                      when v_o_k = 3 then 1.5
                      when v_o_k = 4 then 2.0
                      when v_o_k = 5 then 2.5
                      when v_o_k = 6 then 3.0
                      else 3.0 + 0.5 * (v_o_k - 6) end;
    v_o_amult := (case when v_o_lv < 2 then 1.0
                       when v_o_lv < 3 then 1.2
                       when v_o_lv < 4 then 1.5
                       when v_o_lv < 5 then 2.0
                       else least(6.0, 3.0 + 0.5 * (v_o_lv - 5)) end) * 1.5;
    v_o_cap := (v_o_cleared * 10 * v_o_cmult + v_o_chains * 40 * v_o_k * v_o_k) * v_o_amult;
    v_o_clear := least(greatest(v_o_clear, 0), v_o_cap);
    -- 생존 시간은 클라이언트 주장과 서버 경과시간 중 짧은 쪽 (부풀리기 불가)
    v_o_surv := greatest(0, least(coalesce(v_o_dur, v_elapsed), v_elapsed));

    v_o_raw := v_o_clear
             + least(v_o_ctr, v_o_chains) * 500
             + least(v_o_em, v_o_chains) * 300
             + v_o_ko * 1500
             + (case when floor(v_o_surv) >= 60   then 100   else 0 end)
             + (case when floor(v_o_surv) >= 180  then 500   else 0 end)
             + (case when floor(v_o_surv) >= 300  then 1000  else 0 end)
             + (case when floor(v_o_surv) >= 600  then 5000  else 0 end)
             + (case when floor(v_o_surv) >= 1200 then 20000 else 0 end);
    v_o_raw := greatest(v_o_raw, 0);

    if abs(p_raw_score - v_o_raw) > 0.05 * greatest(v_o_raw, 1) then
      v_raw  := greatest(0, least(round(v_o_raw), 2147483647))::int;
      v_meta := v_meta || jsonb_build_object(
                  'raw_adjusted', true,
                  'raw_client',   p_raw_score,
                  'raw_server',   round(v_o_raw, 2)
                );
    end if;

  -- 🍳 아울 레스토랑: 요리·보너스 점수는 상한 클램프, STAGE CLEAR·∞ 는 정확히 (public.chef_raw)
  elsif v_s.game::text = 'chef' then
    v_c_raw := public.chef_raw(v_meta);
    if abs(p_raw_score - v_c_raw) > 0.05 * greatest(v_c_raw, 1) then
      v_raw  := greatest(0, least(round(v_c_raw), 2147483647))::int;
      v_meta := v_meta || jsonb_build_object(
                  'raw_adjusted', true,
                  'raw_client',   p_raw_score,
                  'raw_server',   round(v_c_raw, 2)
                );
    end if;

  -- 타이퍼는 서버가 점수를 "재계산"할 수 없다 (어떤 단어를 어떤 콤보로 쳤는지 모른다).
  -- 대신 메타로 만들 수 있는 최대 점수를 구해 그 위로는 깎는다 — 거부가 아니라 상한이다.
  elsif v_s.game::text = 'typer' then
    -- 한 단어 최대 = 글자수 22 × 콤보 2.0 × 10점 (games/typer/TyperGame.tsx)
    v_t_cap := coalesce(v_t_hits, 0) * 440;
    if v_t_hits is not null and p_raw_score > v_t_cap then
      v_raw  := greatest(0, least(round(v_t_cap), 2147483647))::int;
      v_meta := v_meta || jsonb_build_object(
                  'raw_adjusted', true,
                  'raw_client',   p_raw_score,
                  'raw_server',   round(v_t_cap, 2)
                );
    end if;
  end if;

  -- 포인트 계산 (20261007): 기본 + 플레이 시간 × 게임별 분당 + 원점수 ÷ K — 상한 없음 (public.game_points)
  v_k := (public.cfg('game_k') ->> (v_s.game::text))::numeric;
  if v_k is null or v_k <= 0 then
    raise exception '게임 설정(game_k)이 올바르지 않아요' using errcode = 'P0001';
  end if;
  v_points := public.game_points(v_s.game::text, v_raw, v_elapsed);

  -- 프로필 잠금 (FK 검사와 충돌하지 않도록 for no key update). owl_energy_sync 가 먼저
  -- for update 로 같은 행을 잠그고 충전하므로, 이 select 는 그 결과(v_p.owl_energy)를 읽는다.
  perform public.owl_energy_sync(v_uid);
  select * into v_p from public.profiles where id = v_uid for no key update;

  -- ---------------------------------------------------------------
  -- 아울 서바이버즈 스테이지 해금 (신규, GDD §8) — 이번 런이 클리어(zones_cleared≥3
  --   또는 survived_sec≥178)면 해금 단계를 stage+1 로 올린다(이미 더 높으면 유지, 상한 3).
  --   다른 게임 제출에서는 현재 해금 값을 그대로 유지한 채 응답 키만 채운다.
  -- ---------------------------------------------------------------
  v_meta_unlock := coalesce((v_p.meta ->> 'survive_stage')::int, 0);
  v_new_unlock  := v_meta_unlock;

  -- survive v3: 스테이지 선택이 없다 — survive_stage 는 "지금까지 도달한 최고 단계"다
  if v_s.game::text = 'survive' then
    v_new_unlock := greatest(v_meta_unlock, v_sv_stage);
  end if;

  -- 아울리스 개인 기록 (§35) — 최고치만 갱신, 플레이 수 +1
  if v_s.game::text = 'owlis' then
    v_o_rec := coalesce(v_p.meta -> 'owlis_record', '{}'::jsonb);
    v_o_rec := jsonb_build_object(
      'best',  greatest(coalesce((v_o_rec ->> 'best')::numeric, 0), v_raw),
      'sec',   greatest(coalesce((v_o_rec ->> 'sec')::numeric, 0), floor(v_o_surv)),
      'combo', greatest(coalesce((v_o_rec ->> 'combo')::numeric, 0), v_o_maxc),
      'level', greatest(coalesce((v_o_rec ->> 'level')::numeric, 0), round(v_o_lv, 2)),
      'games', coalesce((v_o_rec ->> 'games')::numeric, 0) + 1
    );
  end if;

  -- 아울 레스토랑 개인 기록 — 최고 점수 · 최고 단계(그 판의 ∞ LV) · 최대 콤보 · 플레이 수
  if v_s.game::text = 'chef' then
    v_c_rec := coalesce(v_p.meta -> 'chef_record', '{}'::jsonb);
    v_c_rec := jsonb_build_object(
      'best',  greatest(coalesce((v_c_rec ->> 'best')::numeric, 0), v_raw),
      'stage', greatest(coalesce((v_c_rec ->> 'stage')::numeric, 0), v_c_stage),
      'inf',   case
                 when v_c_stage >= 26 then greatest(coalesce((v_c_rec ->> 'inf')::numeric, 0),
                                                    coalesce(public.meta_num(v_meta, 'inf_level'), 1))
                 else coalesce((v_c_rec ->> 'inf')::numeric, 0) end,
      'combo', greatest(coalesce((v_c_rec ->> 'combo')::numeric, 0), coalesce(public.meta_num(v_meta, 'max_combo'), 0)),
      'games', coalesce((v_c_rec ->> 'games')::numeric, 0) + 1
    );
  end if;

  v_total := v_p.total_points + v_points;
  v_level := public.level_from_points(v_total);
  -- 랭크는 누적 포인트로 정한다 (rank_v2 — 레벨과 따로). 내려가지 않는다
  v_rank  := greatest(v_p.rank_idx, public.rank_from_points(v_total));

  if v_rank > v_p.rank_idx then
    insert into public.rank_events (user_id, from_rank, to_rank)
    values (v_uid, v_p.rank_idx, v_rank);

    -- 건너뛴 랭크만큼 티켓 지급. (user_id, earned_rank_idx) unique 로 중복 지급 차단.
    insert into public.tickets (user_id, earned_rank_idx)
    select v_uid, g from generate_series(v_p.rank_idx + 1, v_rank) g
    on conflict on constraint tickets_one_per_rank do nothing;
    get diagnostics v_gained = row_count;

    insert into public.board_events (kind, masked_name, rank_idx)
    values ('rank_up', public.mask_name(v_p.name), v_rank);
  end if;

  -- 챌린저 이후 보너스 티켓 (rank_v2) — 챌린저+1 = earned_rank_idx 30, +2 = 31 …, 티어는 챌린저와 같다.
  --   몇 장째까지 받을 수 있는지는 누적 포인트만 보고 정하므로, 빠진 장이 있으면 여기서 채워진다.
  if v_rank >= 29 then
    insert into public.tickets (user_id, earned_rank_idx)
    select v_uid, 29 + g from generate_series(1, public.challenger_bonus_count(v_total)) g
    on conflict on constraint tickets_one_per_rank do nothing;
    get diagnostics v_bonus = row_count;
    v_gained := v_gained + v_bonus;
  end if;

  -- ---------------------------------------------------------------
  -- 아울 에너지 인게임 드랍 (owl_energy §4.4 flight 조건 유지 + logic/survive 확장)
  --   전부 만족해야 지급: meta.owl_energy_found=true · 게임별 조건 · 오늘(Asia/Seoul 기준)
  --   인게임 드랍이 drop_daily_cap 미만. 같은 daily cap·energy_grants(reason='game_drop')를 쓴다.
  --     · flight   : phase_max ≥ drop_min_phase 이고 distance_m ≥ drop_min_distance
  --     · logic    : tier_max ≥ 4
  --     · survive  : 6단계 이상 도달 (첫 보스를 넘긴 판, v3)
  --     · owlis    : AI LEVEL 3 이상 도달
  --     · chef     : 8단계 이상 도달
  -- ---------------------------------------------------------------
  v_e_flag := coalesce((v_meta -> 'owl_energy_found') = to_jsonb(true), false);
  v_e_ok   := false;

  if v_e_flag then
    if v_s.game = 'flight' then
      v_e_phase := public.meta_num(v_meta, 'phase_max');
      v_e_ok := v_e_phase is not null and v_e_phase >= v_e_dphase
                and v_f_dist is not null and v_f_dist >= v_e_ddist;
    elsif v_s.game::text = 'logic' then
      v_e_ok := v_l_tier_max >= 4;
    elsif v_s.game::text = 'survive' then
      -- v3: 첫 보스(육각형)를 넘긴 판 = 6단계 이상 도달
      v_e_ok := v_sv_stage >= 6;
    elsif v_s.game::text = 'owlis' then
      -- AI LEVEL 3 이상을 본 판 (games/owlis/config.ts 의 owlEnergy.minLevel)
      v_e_ok := v_o_lv >= 3;
    elsif v_s.game::text = 'chef' then
      -- 8단계에 들어간 판 (games/chef/config.ts 의 owlEnergy.minStage)
      v_e_ok := v_c_stage >= 8;
    end if;
  end if;

  if v_e_ok then
    select count(*) into v_e_today
      from public.energy_grants
     where user_id = v_uid and staff_id is null and reason = 'game_drop'
       and created_at >= v_e_day0 and created_at < v_e_day1;

    if v_e_today < v_e_dcap then
      insert into public.energy_grants (user_id, staff_id, amount, reason)
      values (v_uid, null, 1, 'game_drop');
      v_e_gained := 1;
    end if;
  end if;

  v_e_final := least(v_e_hard, v_p.owl_energy + v_e_gained);

  update public.profiles
     set total_points = v_total, level = v_level, rank_idx = v_rank, owl_energy = v_e_final,
         meta = case
                  when v_s.game::text = 'survive' then
                    jsonb_set(
                      jsonb_set(coalesce(v_p.meta, '{}'::jsonb), '{survive_stage}', to_jsonb(v_new_unlock), true),
                      '{survive_theme}',
                      to_jsonb(case when v_meta ->> 'theme' = 'light' then 'light' else 'dark' end),
                      true)
                  when v_s.game::text = 'owlis' then
                    jsonb_set(coalesce(v_p.meta, '{}'::jsonb), '{owlis_record}', v_o_rec, true)
                  when v_s.game::text = 'chef' then
                    jsonb_set(coalesce(v_p.meta, '{}'::jsonb), '{chef_record}', v_c_rec, true)
                  else meta end
   where id = v_uid;

  update public.game_sessions
     set status = 'submitted', submitted_at = now(), raw_score = v_raw,
         points = v_points, meta = v_meta
   where id = v_s.id;

  perform public.expire_stale();
  return jsonb_build_object(
    'status',            'ok',
    'raw_score',         v_raw,
    'points',            v_points,
    'total_points',      v_total,
    'level_before',      v_p.level,
    'level_after',       v_level,
    'rank_before',       v_p.rank_idx,
    'rank_after',        v_rank,
    'tickets_gained',    v_gained,
    'owl_energy_gained', v_e_gained,
    'owl_energy',        v_e_final,
    'unlocked_stage',    v_new_unlock
  );
end;
$$;

revoke execute on function public.submit_game_session_core(uuid, int, jsonb) from public, anon, authenticated;


-- ===== 10. 기존 유저 옮기기 ===========================================
--   · 레벨은 새 곡선으로 다시 계산한다 (곡선이 가팔라져서 숫자가 내려갈 수 있다 — 표시용)
--   · 랭크는 누적 포인트로 다시 계산하고 내려가지 않는다. 새 표가 예전 표보다 촘촘해서
--     누구든 예전 idx 이상이 나온다 (예전 챌린저 27,720P → 성좌 25).
--   · 새 랭크까지 빠진 랭크 티켓을 채운다. 예전 티켓(earned_rank_idx 1~16)은 그대로 두므로
--     "도달한 랭크 하나당 한 장" 이 그대로 지켜진다. 예전 idx 는 새 tier_from_rank 로도
--     거의 같은 티어다(예전 T1~T4·T6 은 같고, 예전 초월자·신화 티켓만 T5 → T6).
--   · 전광판(board_events)·랭크 기록(rank_events)에는 남기지 않는다 — 한꺼번에 뜨면 티커가 도배된다.
update public.profiles
   set level    = public.level_from_points(total_points),
       rank_idx = greatest(rank_idx, public.rank_from_points(total_points));

insert into public.tickets (user_id, earned_rank_idx)
select p.id, g
  from public.profiles p
  cross join lateral generate_series(1, p.rank_idx) g
 where p.rank_idx >= 1
on conflict on constraint tickets_one_per_rank do nothing;

insert into public.tickets (user_id, earned_rank_idx)
select p.id, 29 + g
  from public.profiles p
  cross join lateral generate_series(1, public.challenger_bonus_count(p.total_points)) g
 where p.rank_idx >= 29
on conflict on constraint tickets_one_per_rank do nothing;
