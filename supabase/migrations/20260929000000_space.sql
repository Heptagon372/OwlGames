-- ===================================================================
-- OWL GAMES — 아울스페이스 (OWLSPACE_GDD §15)
--
-- 세로 스크롤 탄막 슈팅. game_id = 'space'.
--   · 생명 3개, 맞으면 -1 / 스치면(그레이즈) 점수
--   · 스테이지 1~15 + 엔드리스, 보스 격파로 다음 스테이지 해금 (profiles.meta.space_stage)
--
-- 무엇을 하는가
--   1) game_id enum 에 'space' 추가
--   2) game_k / game_limits / game_guards 에 space 추가
--   3) submit_game_session 에 space 메타 검증 + 원점수 재계산 + 해금/테마 저장
--
-- ⚠️ enum 제약 (20260926 부터 지켜 온 규칙)
--   같은 트랜잭션에서 새 enum 값을 **값으로 쓸 수 없다**. 그래서 비교는 언제나
--   `v_s.game::text = 'space'` (enum → text) 한 방향만 쓴다.
-- ===================================================================

alter type public.game_id add value if not exists 'space';

-- ===== 1. 환산 계수 K (§10.2, 전 게임 통일 20) =======================
update public.app_config
   set value = jsonb_set(value, '{space}', to_jsonb(20), true)
 where key = 'game_k';

-- ===== 2. 세션 시간 제한 (§15) ======================================
update public.app_config
   set value = jsonb_set(value, '{space}', '{"min_sec":20,"max_sec":200}'::jsonb, true)
 where key = 'game_limits';

-- ===== 3. 거부 기준 (§15 game_guards) ===============================
insert into public.app_config (key, value)
values ('game_guards',
        '{"space":{"max_kills_per_sec":6,"max_graze_per_sec":12,"max_lives":3,"min_clear_sec":55}}'::jsonb)
on conflict (key) do update
   set value = jsonb_set(public.app_config.value, '{space}',
                 '{"max_kills_per_sec":6,"max_graze_per_sec":12,"max_lives":3,"min_clear_sec":55}'::jsonb, true);


-- ===== 4. submit_game_session (space 분기 추가) =====================
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
  v_f_energy numeric;    -- energy_left (0~130 으로 클램프)
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
  -- ↓ 아울 서바이버즈(survive) 전용 (v2 — OWLSURVIVORS_GDD_v2 §11)
  v_sv_stage      int;      -- 선택한 스테이지 (1~)
  v_sv_cleared    boolean;  -- 보스 처치 여부
  v_sv_kills      numeric;  -- 처치 수
  v_sv_level      numeric;  -- 도달 레벨 (≤24)
  v_sv_evo        numeric;  -- 진화 수 (≤3)
  v_sv_mid        boolean;  -- 중간보스 처치
  v_sv_obst       numeric;  -- 부진 장애물 수
  v_sv_dmg        numeric;  -- 피격 횟수 (0 이면 무피격 보너스)
  v_sv_rev        numeric;  -- 부활 사용 횟수
  v_sv_dur        numeric;  -- duration_s (클라이언트 주장 — 대조용)
  v_sv_done       int;      -- 지금까지 클리어한 최고 스테이지
  v_sv_guard      jsonb;    -- app_config.game_guards.survive
  v_sv_survived   numeric;  -- 재계산에 쓰는 생존 시간
  v_sv_stage_mult numeric;  -- 1 + (S-1)×0.06 (상한 3.0)
  v_sv_raw        numeric;  -- 서버가 메타로 재계산한 원점수
  -- ↓ 아울스페이스(space) 전용 (OWLSPACE_GDD §10)
  v_sp_stage   int;      -- 선택한 스테이지
  v_sp_cleared boolean;  -- 보스 격파 여부
  v_sp_kills   numeric;
  v_sp_graze   numeric;  -- 스치기 횟수 (이 게임의 대표 지표)
  v_sp_chips   numeric;
  v_sp_lives   numeric;  -- 남은 생명
  v_sp_bombs   numeric;  -- 남은 봐
  v_sp_dmg     numeric;  -- 피격 횟수
  v_sp_boss    boolean;
  v_sp_dur     numeric;
  v_sp_done    int;      -- 지금까지 클리어한 최고 스테이지
  v_sp_guard   jsonb;
  v_sp_surv    numeric;
  v_sp_mult    numeric;
  v_sp_raw     numeric;
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
  -- ↓ 피싱 헌터(phish) 전용 (신규)
  v_ph_ans   numeric;    -- meta.answered
  v_ph_ok    numeric;    -- meta.correct
  v_ph_bad   numeric;    -- meta.wrong
  v_ph_strk  numeric;    -- meta.max_streak
  v_ph_dur   numeric;    -- meta.duration_s (클라이언트 주장 — 대조용)
  v_ph_cap   numeric;    -- 메타로 계산한 원점수 상한
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

    if v_reason is null then
      -- 물리적 최대 속도 24 m/s (§2 SCROLL_V_MAX = 576px/s ÷ 24px/m) + 오차 2%
      if v_f_dist is null or v_f_dist < 0 or v_f_dist > 24 * v_elapsed * 1.02 then
        v_reason := '거리가 물리적으로 불가능해요';
      -- 장애물/게이트는 8m 간격보다 촘촘히 놓이지 않는다
      elsif v_f_pass > v_f_dist / 8 then
        v_reason := '통과 횟수가 거리에 비해 너무 많아요';
      -- 니어미스는 "통과하면서" 아슬아슬했던 횟수라 통과 수를 넘을 수 없다
      elsif v_f_near > v_f_pass then
        v_reason := '니어미스 수가 통과 횟수보다 많아요';
      -- 클라이언트가 주장하는 플레이 시간이 서버 경과시간보다 길다 (허용 오차 2초)
      elsif v_f_dur is not null and v_f_dur > v_elapsed + 2 then
        v_reason := '플레이 시간이 서버 기록과 맞지 않아요';
      end if;
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

  -- 🛡️ 아울 서바이버즈 v2 — 한 스테이지 = 한 런. 보스를 잡아야 클리어다.
  elsif v_s.game::text = 'survive' then
    v_sv_stage   := coalesce(public.meta_num(v_meta, 'stage'), 0)::int;
    v_sv_cleared := coalesce((v_meta -> 'cleared') = to_jsonb(true), false);
    v_sv_kills   := coalesce(public.meta_num(v_meta, 'kills'), 0);
    v_sv_level   := coalesce(public.meta_num(v_meta, 'level'), 0);
    v_sv_evo     := coalesce(public.meta_num(v_meta, 'evolutions'), 0);
    v_sv_mid     := coalesce((v_meta -> 'midboss') = to_jsonb(true), false);
    v_sv_obst    := coalesce(public.meta_num(v_meta, 'obstacles'), 0);
    v_sv_dmg     := coalesce(public.meta_num(v_meta, 'damage_taken'), 0);
    v_sv_rev     := coalesce(public.meta_num(v_meta, 'revives_used'), 0);
    v_sv_dur     := public.meta_num(v_meta, 'duration_s');
    v_sv_guard   := coalesce(public.cfg('game_guards') -> 'survive', '{}'::jsonb);

    select coalesce((meta ->> 'survive_stage')::int, 0) into v_sv_done
      from public.profiles where id = v_uid;

    if v_reason is null then
      if v_sv_stage < 1 then
        v_reason := '스테이지 값이 올바르지 않아요';
      -- 해금한 다음 스테이지까지만 골라질 수 있다 (§11.3)
      elsif v_sv_stage > v_sv_done + 1 then
        v_reason := '아직 열리지 않은 스테이지예요';
      elsif v_sv_kills > v_elapsed * coalesce((v_sv_guard ->> 'max_kills_per_sec')::numeric, 8) then
        v_reason := '처치 수가 물리적으로 불가능해요';
      elsif v_sv_level > coalesce((v_sv_guard ->> 'max_level')::numeric, 24) then
        v_reason := '레벨이 상한을 넘었어요';
      elsif v_sv_evo > coalesce((v_sv_guard ->> 'max_evolutions')::numeric, 3) then
        v_reason := '진화 수가 상한을 넘었어요';
      -- 보스는 100초에 나온다 — 그전에 클리어는 불가능
      elsif v_sv_cleared and v_elapsed < coalesce((v_sv_guard ->> 'min_clear_sec')::numeric, 90) then
        v_reason := '보스 등장 전에는 클리어할 수 없어요';
      -- 중간보스는 40초에 나온다
      elsif v_sv_mid and v_elapsed < 40 then
        v_reason := '중간보스 처치 시점이 맞지 않아요';
      elsif v_sv_rev > 2 then
        v_reason := '부활 횟수가 상한을 넘었어요';
      elsif v_sv_dur is not null and v_sv_dur > v_elapsed + 2 then
        v_reason := '플레이 시간이 서버 기록과 맞지 않아요';
      end if;
    end if;

  -- 🚀 아울스페이스 — 맞으면 끝, 스치면 점수 (§10.3)
  elsif v_s.game::text = 'space' then
    v_sp_stage   := coalesce(public.meta_num(v_meta, 'stage'), 0)::int;
    v_sp_cleared := coalesce((v_meta -> 'cleared') = to_jsonb(true), false);
    v_sp_kills   := coalesce(public.meta_num(v_meta, 'kills'), 0);
    v_sp_graze   := coalesce(public.meta_num(v_meta, 'graze'), 0);
    v_sp_chips   := coalesce(public.meta_num(v_meta, 'chips'), 0);
    v_sp_lives   := coalesce(public.meta_num(v_meta, 'lives_left'), 0);
    v_sp_bombs   := coalesce(public.meta_num(v_meta, 'bombs_unused'), 0);
    v_sp_dmg     := coalesce(public.meta_num(v_meta, 'damage_taken'), 0);
    v_sp_boss    := coalesce((v_meta -> 'boss_killed') = to_jsonb(true), false);
    v_sp_dur     := public.meta_num(v_meta, 'duration_s');
    v_sp_guard   := coalesce(public.cfg('game_guards') -> 'space', '{}'::jsonb);

    select coalesce((meta ->> 'space_stage')::int, 0) into v_sp_done
      from public.profiles where id = v_uid;

    if v_reason is null then
      if v_sp_stage < 1 then
        v_reason := '스테이지 값이 올바르지 않아요';
      elsif v_sp_stage > v_sp_done + 1 then
        v_reason := '아직 열리지 않은 스테이지예요';
      elsif v_sp_kills > v_elapsed * coalesce((v_sp_guard ->> 'max_kills_per_sec')::numeric, 6) then
        v_reason := '처치 수가 물리적으로 불가능해요';
      -- 초당 12회를 넘는 스치기는 불가능하다
      elsif v_sp_graze > v_elapsed * coalesce((v_sp_guard ->> 'max_graze_per_sec')::numeric, 12) then
        v_reason := '스치기 횟수가 물리적으로 불가능해요';
      elsif v_sp_lives > coalesce((v_sp_guard ->> 'max_lives')::numeric, 3) then
        v_reason := '남은 생명이 상한을 넘었어요';
      -- 생명 3 + 보스 격파 보상 1 = 최대 4. 피격 횟수와 합치면 4를 넘을 수 없다
      elsif v_sp_dmg + v_sp_lives > 4 then
        v_reason := '생명과 피격 기록이 맞지 않아요';
      -- 보스는 55초에 나온다
      elsif v_sp_cleared and v_elapsed < coalesce((v_sp_guard ->> 'min_clear_sec')::numeric, 55) then
        v_reason := '보스 등장 전에는 클리어할 수 없어요';
      elsif v_sp_dur is not null and v_sp_dur > v_elapsed + 2 then
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

  -- 🎣 피싱 헌터 (신규) — 오답 1회가 제한시간을 5초 깎으므로 경과시간이 오답 수를 증명한다
  elsif v_s.game::text = 'phish' then
    v_ph_ans  :=             public.meta_num(v_meta, 'answered');
    v_ph_ok   := greatest(0, coalesce(public.meta_num(v_meta, 'correct'), 0));
    v_ph_bad  := greatest(0, coalesce(public.meta_num(v_meta, 'wrong'), 0));
    v_ph_strk := greatest(0, coalesce(public.meta_num(v_meta, 'max_streak'), 0));
    v_ph_dur  :=             public.meta_num(v_meta, 'duration_s');

    if v_reason is null and v_ph_ans is not null then
      if v_ph_ans < 0 or v_ph_ans <> v_ph_ok + v_ph_bad then
        v_reason := '판별 수가 올바르지 않아요';
      -- 카드 한 장을 읽고 넘기려면 최소 0.6초 (스와이프 연출 0.26초 + 읽는 시간)
      elsif v_ph_ans > (v_elapsed / 0.6) + 2 then
        v_reason := '판별 속도가 물리적으로 불가능해요';
      elsif v_ph_strk > v_ph_ok then
        v_reason := '연속 정답이 정답 수보다 많아요';
      -- 제한시간 90초에서 오답마다 5초가 깎인다 → 오답이 많을수록 판이 일찍 끝난다
      -- (카운트다운·제출 지연을 감안해 8초 여유)
      elsif v_elapsed > 90 - 5 * v_ph_bad + 8 then
        v_reason := '오답 횟수가 플레이 시간과 맞지 않아요';
      elsif v_ph_dur is not null and v_ph_dur > v_elapsed + 2 then
        v_reason := '플레이 시간이 서버 기록과 맞지 않아요';
      end if;
    end if;
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
      'unlocked_stage',    case when v_s.game::text = 'space'
                                then coalesce((v_p.meta ->> 'space_stage')::int, 0)
                                else coalesce((v_p.meta ->> 'survive_stage')::int, 0) end
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
    v_f_mult   := least(2.5, greatest(1.0, v_f_mult));                 -- 콤보 배율 1.0~2.5
    v_f_energy := least(130, v_f_energy);                              -- 최대 에너지는 L 크기의 130
    -- 아이템 1개당 최대 300점: 최고가 아이템 💎(150)에 FEATHER STORM ×1.5 = 225 + 여유
    v_f_iscore := least(300 * v_f_items + 300, v_f_iscore);
    v_f_spec   := least(10, v_f_spec);                                 -- 185초 안에 특수구간 10회는 불가능
    v_f_sbonus := least(800 * (v_f_spec + 1), v_f_sbonus);             -- 특수구간 1개당 800점 상한
    v_f_dist   := greatest(0, coalesce(v_f_dist, 0));

    v_f_raw := v_f_dist
             + v_f_pass   * 10 * v_f_mult
             + v_f_near   * 25 * v_f_mult
             + v_f_iscore
             + v_f_spec   * 200
             + v_f_energy * 2
             + v_f_sbonus;

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
    -- §11.1: (처치×3 + 생존초×6 + 레벨×40 + 진화×300 + 중간보스×250
    --          + 클리어×1000 + 장애물×8 + 무피격 500) × 스테이지 배율
    v_sv_kills := greatest(0, coalesce(v_sv_kills, 0));
    v_sv_level := greatest(0, least(coalesce(v_sv_level, 0), 24));
    v_sv_evo   := greatest(0, least(coalesce(v_sv_evo, 0), 3));
    v_sv_obst  := greatest(0, least(coalesce(v_sv_obst, 0), 64));
    v_sv_dmg   := greatest(0, coalesce(v_sv_dmg, 0));

    -- 생존 시간은 클라이언트 주장과 서버 경과시간 중 짧은 쪽 (부풀리기 불가)
    v_sv_survived   := greatest(0, least(coalesce(v_sv_dur, v_elapsed), v_elapsed));
    v_sv_stage_mult := least(3.0, 1.0 + 0.06 * (greatest(1, v_sv_stage) - 1));

    v_sv_raw := (v_sv_kills * 3
               + floor(v_sv_survived) * 6
               + v_sv_level * 40
               + v_sv_evo * 300
               + (case when v_sv_mid then 250 else 0 end)
               + (case when v_sv_cleared then 1000 else 0 end)
               + v_sv_obst * 8
               + (case when v_sv_dmg = 0 then 500 else 0 end)) * v_sv_stage_mult;
    v_sv_raw := greatest(v_sv_raw, 0);

    if abs(p_raw_score - v_sv_raw) > 0.05 * greatest(v_sv_raw, 1) then
      v_raw  := greatest(0, least(round(v_sv_raw), 2147483647))::int;
      v_meta := v_meta || jsonb_build_object(
                  'raw_adjusted', true,
                  'raw_client',   p_raw_score,
                  'raw_server',   round(v_sv_raw, 2)
                );
    end if;

  elsif v_s.game::text = 'space' then
    -- §10.1: (처치×4 + 그레이즈×15 + 칩×2 + 생존초×5 + 보스×500
    --          + 클리어×1000 + 남은생명×300 + 무피격 600 + 남은봐×100) × 스테이지 배율
    v_sp_kills := greatest(0, coalesce(v_sp_kills, 0));
    v_sp_graze := greatest(0, coalesce(v_sp_graze, 0));
    v_sp_chips := greatest(0, coalesce(v_sp_chips, 0));
    v_sp_lives := greatest(0, least(coalesce(v_sp_lives, 0), 3));
    v_sp_bombs := greatest(0, least(coalesce(v_sp_bombs, 0), 5));
    v_sp_dmg   := greatest(0, coalesce(v_sp_dmg, 0));
    v_sp_surv  := greatest(0, least(coalesce(v_sp_dur, v_elapsed), v_elapsed));
    v_sp_mult  := least(3.0, 1.0 + 0.06 * (greatest(1, v_sp_stage) - 1));

    v_sp_raw := (v_sp_kills * 4
               + v_sp_graze * 15
               + v_sp_chips * 2
               + floor(v_sp_surv) * 5
               + (case when v_sp_boss then 500 else 0 end)
               + (case when v_sp_cleared then 1000 else 0 end)
               + v_sp_lives * 300
               + (case when v_sp_dmg = 0 and v_sp_cleared then 600 else 0 end)
               + v_sp_bombs * 100) * v_sp_mult;
    v_sp_raw := greatest(v_sp_raw, 0);

    if abs(p_raw_score - v_sp_raw) > 0.05 * greatest(v_sp_raw, 1) then
      v_raw  := greatest(0, least(round(v_sp_raw), 2147483647))::int;
      v_meta := v_meta || jsonb_build_object(
                  'raw_adjusted', true,
                  'raw_client',   p_raw_score,
                  'raw_server',   round(v_sp_raw, 2)
                );
    end if;

  -- 타이퍼·피싱은 서버가 점수를 "재계산"할 수 없다 (어떤 단어를 어떤 콤보로 쳤는지 모른다).
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

  elsif v_s.game::text = 'phish' then
    v_ph_cap := public.phish_max_score(v_ph_ok::int, v_ph_strk::int);
    if v_ph_ans is not null and p_raw_score > v_ph_cap then
      v_raw  := greatest(0, least(round(v_ph_cap), 2147483647))::int;
      v_meta := v_meta || jsonb_build_object(
                  'raw_adjusted', true,
                  'raw_client',   p_raw_score,
                  'raw_server',   round(v_ph_cap, 2)
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

  -- 보스를 잡았을 때만 다음 스테이지가 열린다 (survive §3 / space §6)
  if v_s.game::text = 'survive' and v_sv_cleared then
    v_new_unlock := greatest(v_meta_unlock, v_sv_stage);
  elsif v_s.game::text = 'space' then
    v_meta_unlock := coalesce((v_p.meta ->> 'space_stage')::int, 0);
    v_new_unlock  := v_meta_unlock;
    if v_sp_cleared then
      v_new_unlock := greatest(v_meta_unlock, v_sp_stage);
    end if;
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
  --     · survive  : 3스테이지 이상을 **클리어**했을 때
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
      v_e_ok := v_sv_cleared and v_sv_stage >= 3;
    elsif v_s.game::text = 'space' then
      v_e_ok := v_sp_cleared and v_sp_stage >= 3;
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
                  when v_s.game::text = 'space' then
                    jsonb_set(
                      jsonb_set(coalesce(v_p.meta, '{}'::jsonb), '{space_stage}', to_jsonb(v_new_unlock), true),
                      '{space_theme}',
                      to_jsonb(case when v_meta ->> 'theme' = 'light' then 'light' else 'dark' end),
                      true)
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
