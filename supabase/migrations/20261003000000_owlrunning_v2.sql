-- ===================================================================
-- OWL GAMES — 아울러닝 2.0 (15단계 + ∞ · FEVER · COLOR POWER · 랜덤 이벤트)
--
-- 무엇을 하는가
--   1) game_k.flight 20 → 100
--        2.0 은 배율(FEVER ×3 · SCORE ×2 · OVERDRIVE ×2 · 색 체인)과 보너스가 붙어 원점수 스케일이 커졌고,
--        초보 보호·체력 증가로 판이 길어졌다. 봇(보통 실력) 중앙값 73초 · 9단계 · raw ≈ 9,400 → 약 124P.
--   2) flight_reject_reason(meta, elapsed) · flight_raw(meta) 헬퍼 신설
--        submit_game_session 본문에 박혀 있던 flight 검증·재계산을 헬퍼로 뺐다.
--        → 다음에 아울러닝 채점을 바꿀 때는 이 두 함수만 다시 만들면 된다 (본문 전체를 복사하지 않아도 된다).
--   3) submit_game_session — 20261002_owlis 버전 본문 그대로, flight 분기 두 곳만 헬퍼 호출로 바꿨다.
--
-- 채점 (games/flight/engine/score.ts 와 같은 식)
--   base  = 거리 + 통과×10×콤보배율 + NEAR MISS×50×콤보배율 + PERFECT×40 + 아이템 기본점수
--   raw   = base + 남은 에너지×2 + bonus
--   bonus = 배율·고정 보너스 몫. 상한 = base×4 + 도달 단계×400 + 2000 (클라이언트 배율 곱 상한 ×5 와 짝)
--   1.x 빌드(meta 에 bonus_score 가 없음)는 예전 식 그대로 채점한다 — 배포 중 열려 있던 탭 대비.
--
-- 체력
--   최대 에너지 S 80 · M 100 · L 130 → S 110 · M 140 · L 180 (초반이 어렵다는 피드백). energy_left 상한도 180.
--
-- 검증
--   평균 속도 상한 24 → 30 m/s (터보 ×1.5 · 오버드라이브 ×1.3 · ∞ 최대 +20% — 순간 최고 속도가 24를 넘는다.
--   봇 200판 기준 실제 평균 최대치는 18 m/s 안팎이라 여유가 크다)
--   PERFECT 수 ≤ 통과 수 + 1 (PERFECT 게이트는 곧 통과로 집계된다)
--
-- 주의
--   20261002_owlis 가 아직 커밋 전이다. 그쪽 submit_game_session 본문이 바뀌면 이 파일의 본문도 다시 떠야 한다
--   (flight 분기 두 곳 = 헬퍼 호출만 유지하면 된다).
--   아울 에너지 드롭 조건(phase_max ≥ 3 · distance_m ≥ 900)은 그대로 — 클라이언트가 900m 전에는 드롭을 안 깐다.
-- ===================================================================

-- ===== 1. 환산 계수 K ===============================================
update public.app_config
   set value = jsonb_set(value, '{flight}', to_jsonb(100), true)
 where key = 'game_k';

-- ===== 2. 아울러닝 헬퍼 =============================================

-- 2.1 거부 사유 (없으면 null). 시간은 서버 기준(p_elapsed)만 믿는다.
create or replace function public.flight_reject_reason(p_meta jsonb, p_elapsed numeric)
returns text
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
declare
  v_dist    numeric := public.meta_num(p_meta, 'distance_m');
  v_dur     numeric := public.meta_num(p_meta, 'duration_s');
  v_pass    numeric := greatest(0, coalesce(public.meta_num(p_meta, 'pass_count'), 0));
  v_near    numeric := greatest(0, coalesce(public.meta_num(p_meta, 'near_miss'), 0));
  v_perfect numeric := greatest(0, coalesce(public.meta_num(p_meta, 'perfect_count'), 0));
begin
  -- 평균 속도 30 m/s + 오차 2% (2.0 터보·오버드라이브 포함, games/flight/config.ts CFG.server.maxAvgMps)
  if v_dist is null or v_dist < 0 or v_dist > 30 * p_elapsed * 1.02 then
    return '거리가 물리적으로 불가능해요';
  -- 장애물/게이트는 8m 간격보다 촘촘히 놓이지 않는다
  elsif v_pass > v_dist / 8 then
    return '통과 횟수가 거리에 비해 너무 많아요';
  -- 니어미스는 "통과하면서" 아슬아슬했던 횟수라 통과 수를 넘을 수 없다
  elsif v_near > v_pass then
    return '니어미스 수가 통과 횟수보다 많아요';
  -- PERFECT 게이트는 곧 통과로 집계된다 (마지막 게이트 직후 사망 1개 허용)
  elsif v_perfect > v_pass + 1 then
    return 'PERFECT 수가 통과 횟수보다 많아요';
  -- 클라이언트가 주장하는 플레이 시간이 서버 경과시간보다 길다 (허용 오차 2초)
  elsif v_dur is not null and v_dur > p_elapsed + 2 then
    return '플레이 시간이 서버 기록과 맞지 않아요';
  end if;
  return null;
end;
$$;

comment on function public.flight_reject_reason(jsonb, numeric)
  is '아울러닝 메타 거부 사유 (없으면 null) — submit_game_session 이 부른다.';

-- 2.2 서버 재계산 원점수. 클램프는 방어용이다 (여기서 막지 않으면 bonus 하나로 300P 를 살 수 있다).
create or replace function public.flight_raw(p_meta jsonb)
returns numeric
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
declare
  v_dist    numeric := greatest(0, coalesce(public.meta_num(p_meta, 'distance_m'), 0));
  v_pass    numeric := greatest(0, coalesce(public.meta_num(p_meta, 'pass_count'), 0));
  v_near    numeric := greatest(0, coalesce(public.meta_num(p_meta, 'near_miss'), 0));
  v_items   numeric := greatest(0, coalesce(public.meta_num(p_meta, 'items'), 0));
  v_iscore  numeric := greatest(0, coalesce(public.meta_num(p_meta, 'item_score'), 0));
  -- 콤보 배율 1.0~2.5 · 최대 에너지는 L 크기의 180 (2.0 에서 체력을 늘렸다, 1.x 는 130)
  v_mult    numeric := least(2.5, greatest(1.0, coalesce(public.meta_num(p_meta, 'combo_mult_avg'), 1.0)));
  v_energy  numeric := least(180, greatest(0, coalesce(public.meta_num(p_meta, 'energy_left'), 0)));
  v_perfect numeric;
  v_stage   numeric;
  v_bonus   numeric;
  v_spec    numeric;
  v_base    numeric;
begin
  if not (p_meta ? 'bonus_score') then
    -- 1.x 빌드 — 20260924_owlrunning 식 그대로 (최대 에너지 130)
    v_energy := least(130, v_energy);
    v_spec   := least(10, greatest(0, coalesce(public.meta_num(p_meta, 'special_cleared'), 0)));
    v_bonus  := least(800 * (v_spec + 1), greatest(0, coalesce(public.meta_num(p_meta, 'special_bonus_score'), 0)));
    v_iscore := least(300 * v_items + 300, v_iscore);
    return v_dist + v_pass * 10 * v_mult + v_near * 25 * v_mult + v_iscore + v_spec * 200 + v_energy * 2 + v_bonus;
  end if;

  -- 2.0 — 아이템 1개당 최대 600점 (🟡 황금 부엉이 500 + 여유) · PERFECT ≤ 통과 + 1 · 단계 ≤ 60
  v_iscore  := least(600 * v_items + 600, v_iscore);
  v_perfect := least(v_pass + 1, greatest(0, coalesce(public.meta_num(p_meta, 'perfect_count'), 0)));
  v_stage   := least(60, greatest(1, coalesce(public.meta_num(p_meta, 'stage_max'), 1)));
  v_base    := v_dist + v_pass * 10 * v_mult + v_near * 50 * v_mult + v_perfect * 40 + v_iscore;
  v_bonus   := least(v_base * 4 + 400 * v_stage + 2000,
                     greatest(0, coalesce(public.meta_num(p_meta, 'bonus_score'), 0)));
  return v_base + v_energy * 2 + v_bonus;
end;
$$;

comment on function public.flight_raw(jsonb)
  is '아울러닝 원점수 서버 재계산 (games/flight/engine/score.ts 와 같은 식). 1.x 메타는 예전 식.';

revoke execute on function public.flight_reject_reason(jsonb, numeric) from public, anon, authenticated;
revoke execute on function public.flight_raw(jsonb) from public, anon, authenticated;

-- ===== 3. submit_game_session (20261002_owlis 본문 + flight 헬퍼) ====
create or replace function public.submit_game_session(
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

  -- 포인트 계산: 30 + min(270, floor(raw / K)) → 30~300P
  v_k := (public.cfg('game_k') ->> (v_s.game::text))::numeric;
  if v_k is null or v_k <= 0 then
    raise exception '게임 설정(game_k)이 올바르지 않아요' using errcode = 'P0001';
  end if;
  v_points := 30 + least(270, floor(v_raw::numeric / v_k))::int;

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

  v_total := v_p.total_points + v_points;
  v_level := public.level_from_points(v_total);
  -- 랭크는 내려가지 않는다 (곡선을 바꿔도 기존 랭크 유지)
  v_rank  := greatest(v_p.rank_idx, public.rank_from_level(v_level));

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

  -- ---------------------------------------------------------------
  -- 아울 에너지 인게임 드랍 (owl_energy §4.4 flight 조건 유지 + logic/survive 확장)
  --   전부 만족해야 지급: meta.owl_energy_found=true · 게임별 조건 · 오늘(Asia/Seoul 기준)
  --   인게임 드랍이 drop_daily_cap 미만. 같은 daily cap·energy_grants(reason='game_drop')를 쓴다.
  --     · flight   : phase_max ≥ drop_min_phase 이고 distance_m ≥ drop_min_distance
  --     · logic    : tier_max ≥ 4
  --     · survive  : 6단계 이상 도달 (첫 보스를 넘긴 판, v3)
  --     · owlis    : AI LEVEL 3 이상 도달
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

revoke execute on function public.submit_game_session(uuid, int, jsonb) from public, anon, authenticated;
grant execute on function public.submit_game_session(uuid, int, jsonb) to authenticated;
