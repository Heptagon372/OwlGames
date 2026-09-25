-- =====================================================================
-- OWL GAMES — 신규 게임 2종 서버 지원: 아울 로직(logic) / 아울 서바이버즈(survive)
-- 대상: Supabase / PostgreSQL 15
-- 명세: OWLLOGIC_GDD.md §7 (점수·검증), OWLSURVIVORS_GDD.md §8~§10 (스테이지·점수·검증)
--       OWLGAMES_SPEC.md §7 공통 규칙
-- 전제: 20260923000000_init.sql, 20260924000000_owlrunning.sql,
--       20260925000000_owl_energy.sql 적용 완료
--
-- 이 마이그레이션이 바꾸는 것:
--   1) game_id enum 에 'logic' / 'survive' 추가, profiles.meta(jsonb) 컬럼 추가
--   2) app_config 에 두 게임의 game_k / game_limits / survive_stages 추가
--   3) submit_game_session 에 logic·survive 전용 메타 검증/원점수 재계산 +
--      아울 서바이버즈 스테이지 해금 + 아울 에너지 인게임 드랍 조건 확장
-- 그 외 플랫폼 규칙(포인트 30~300P, 레벨/랭크/티켓, 전광판, RLS, 권한, 아울 에너지
-- 소모/회복)은 이전 마이그레이션 그대로이며 여기서 건드리지 않는다.
--
-- ⚠️ enum 값 사용 제약: Postgres 는 "ALTER TYPE ... ADD VALUE" 로 새로 추가한 enum
--   값을, 그 값을 추가한 트랜잭션 안에서 리터럴로 캐스팅해 쓰는 것을 금지한다
--   (예: 'logic'::public.game_id 는 같은 트랜잭션에서 실행하면 예외가 난다 —
--   "unsafe use of new value of enum type"). 마이그레이션 파일 전체가 하나의
--   트랜잭션으로 실행되는 경우(예: 이 프로젝트의 PGlite 테스트 하니스, 일부 마이그레이션
--   러너)가 있어 실제로 이 문제가 재현된다. 그래서 이 파일 안(특히 아래 함수 본문)에서는
--   `v_s.game = 'logic'::public.game_id` 처럼 문자열을 enum 으로 캐스팅하는 비교를
--   절대 쓰지 않고, 반대 방향으로 `v_s.game::text = 'logic'` (enum → text) 만 쓴다.
--   기존 값인 'flight' 는 이전 마이그레이션에서 이미 커밋됐으므로 그대로 enum 비교를 써도 된다.
-- =====================================================================


-- ===== 1. 타입 / 스키마 =============================================

-- 1.1 game_id enum 확장 (§0 주석 참고 — 이 값들을 같은 트랜잭션에서 리터럴로 캐스팅하지 않는다)
alter type public.game_id add value if not exists 'logic';
alter type public.game_id add value if not exists 'survive';

-- 1.2 게임별 진행 상태(현재는 아울 서바이버즈 스테이지 해금만 사용) — 범용 확장 슬롯
--     예: {"survive_unlock": 2}  (1~3, 기본 1 = 서버실만 해금)
alter table public.profiles
  add column if not exists meta jsonb not null default '{}'::jsonb;


-- ===== 2. app_config 갱신 (멱등) =====================================

-- 2.1 환산 계수 K: logic(20, §7.2) · survive(30). survive 가 20 이면 스테이지 1 풀클리어
--     (raw ≈ 6,300) 만으로 상한 300P 라 난이도 선택이 무의미해져 30 으로 올렸다.
--     기존 typer(4)·flight(20)·phish(10) 은 건드리지 않는다 — 그래서 jsonb_set 으로 두 키만 갱신한다.
insert into public.app_config (key, value)
values ('game_k', '{"typer":4,"flight":20,"phish":10,"logic":20,"survive":30}'::jsonb)
on conflict (key) do update
   set value = jsonb_set(
                 jsonb_set(app_config.value, '{logic}',   to_jsonb(20), true),
                 '{survive}', to_jsonb(30), true
               );

-- 2.2 세션 시간 제한: logic(10~185초, GDD §7.3 "duration_s < 10 또는 > 185"),
--     survive(15~200초, GDD §9.3 "duration_s < 15 또는 > 200"). 기존 게임 값 유지.
insert into public.app_config (key, value)
values ('game_limits',
        '{"typer":{"min_sec":10,"max_sec":65},
          "flight":{"min_sec":3,"max_sec":185},
          "phish":{"min_sec":20,"max_sec":95},
          "logic":{"min_sec":10,"max_sec":185},
          "survive":{"min_sec":15,"max_sec":200}}'::jsonb)
on conflict (key) do update
   set value = jsonb_set(
                 jsonb_set(app_config.value, '{logic}',   '{"min_sec":10,"max_sec":185}'::jsonb, true),
                 '{survive}', '{"min_sec":15,"max_sec":200}'::jsonb, true
               );

-- 2.3 아울 서바이버즈 스테이지 해금/배율 (신규 키, GDD §8). mult 는 stage 1~3 → 배열 idx 0~2.
insert into public.app_config (key, value)
values ('survive_stages', '{"unlock_default":1,"max":3,"mult":[1.0,1.25,1.5]}'::jsonb)
on conflict (key) do update set value = excluded.value;


-- ===== 3. submit_game_session 재정의 =================================
-- 20260925000000_owl_energy.sql 본문을 그대로 두고 logic·survive 전용 단계만 끼워 넣는다.
--   · 시그니처·제네릭 검증·flight 규칙·포인트/레벨/랭크/티켓/board_events·아울 에너지
--     소모/충전/부스 지급: 전부 동일
--   · 추가되는 것:
--     (a) logic 메타 거부 규칙 + 원점수 재계산 (GDD OWLLOGIC §7.3)
--     (b) survive 메타 거부 규칙 + 원점수 재계산 + 스테이지 해금 (GDD OWLSURVIVORS §9.3, §8)
--     (c) 아울 에너지 인게임 드랍 조건을 logic(tier_max≥4)·survive(zones_cleared≥3
--         또는 boss_killed) 로 확장 (기존 flight 조건은 그대로)
--     (d) 응답에 'unlocked_stage' 키 추가 (모든 게임 공통 — 현재 해금 단계)
--   · typer/phish 는 두 if 가드 밖이라 동작이 이전과 완전히 같다.
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
  -- ↓ 아울 서바이버즈(survive) 전용 (신규, GDD OWLSURVIVORS §8/§9)
  v_sv_kills      numeric;  -- 처치 수
  v_sv_level      numeric;  -- 도달 레벨 (≤20)
  v_sv_evolutions numeric;  -- 진화 수 (≤3)
  v_sv_elite      numeric;  -- 엘리트 처치 수
  v_sv_boss       boolean;  -- 보스 처치 여부
  v_sv_zones      numeric;  -- 클리어한 구역 수 (≤3)
  v_sv_stage      int;      -- 선택한 스테이지 (1~3)
  v_sv_dur        numeric;  -- duration_s (클라이언트 주장 — 검증용으로만 씀)
  v_sv_unlock     int;      -- 검증 시점의 유저 해금 단계
  v_sv_survived   numeric;  -- survived_sec (재계산에 쓰는 생존 시간)
  v_sv_stage_mult numeric;  -- survive_stages.mult[stage]
  v_sv_raw        numeric;  -- 서버가 메타로 재계산한 원점수
  -- ↓ 아울 서바이버즈 스테이지 해금 (신규, 모든 게임 공통 응답 키)
  v_meta_unlock int;      -- 이번 제출 이전의 해금 단계 (profiles.meta 기준)
  v_new_unlock  int;      -- 이번 제출 이후의 해금 단계 (survive 클리어 시에만 증가)
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

  elsif v_s.game::text = 'survive' then
    v_sv_kills      := coalesce(public.meta_num(v_meta, 'kills'), 0);
    v_sv_level      := coalesce(public.meta_num(v_meta, 'level'), 0);
    v_sv_evolutions := coalesce(public.meta_num(v_meta, 'evolutions'), 0);
    v_sv_elite      := coalesce(public.meta_num(v_meta, 'elite_kills'), 0);
    v_sv_boss       := coalesce((v_meta -> 'boss_killed') = to_jsonb(true), false);
    v_sv_zones      := coalesce(public.meta_num(v_meta, 'zones_cleared'), 0);
    v_sv_stage      := coalesce(public.meta_num(v_meta, 'stage'), 0)::int;
    v_sv_dur        := public.meta_num(v_meta, 'duration_s');

    if v_reason is null then
      select coalesce((meta ->> 'survive_unlock')::int, 1) into v_sv_unlock
        from public.profiles where id = v_uid;

      if v_sv_kills > v_elapsed * 8 then
        v_reason := '처치 수가 물리적으로 불가능해요';
      elsif v_sv_level > 20 then
        v_reason := '레벨이 상한을 넘었어요';
      elsif v_sv_evolutions > 3 then
        v_reason := '진화 수가 상한을 넘었어요';
      elsif v_sv_boss and v_elapsed < 165 then
        v_reason := '보스 처치 시간이 맞지 않아요';
      elsif v_sv_zones > 3
         or (v_sv_zones >= 1 and v_elapsed < 60)
         or (v_sv_zones >= 2 and v_elapsed < 120)
         or (v_sv_zones = 3 and v_elapsed < 165) then
        v_reason := '구역 클리어가 시간과 맞지 않아요';
      elsif v_sv_stage not between 1 and 3 then
        v_reason := '스테이지 값이 올바르지 않아요';
      elsif v_sv_stage > v_sv_unlock then
        v_reason := '아직 열리지 않은 스테이지예요';
      elsif v_sv_dur is not null and v_sv_dur > v_elapsed + 2 then
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
      'unlocked_stage',    coalesce((v_p.meta ->> 'survive_unlock')::int, 1)
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
    v_sv_kills      := greatest(0, coalesce(v_sv_kills, 0));
    v_sv_level      := greatest(0, coalesce(v_sv_level, 0));
    v_sv_evolutions := greatest(0, coalesce(v_sv_evolutions, 0));
    v_sv_elite      := greatest(0, coalesce(v_sv_elite, 0));
    v_sv_zones      := greatest(0, coalesce(v_sv_zones, 0));

    -- survived_sec: 클라이언트 duration_s 와 서버 경과시간 중 더 짧은 쪽(= 부풀리기 불가)
    v_sv_survived   := greatest(0, least(coalesce(v_sv_dur, v_elapsed), v_elapsed));
    v_sv_stage_mult := coalesce(((public.cfg('survive_stages') -> 'mult') ->> (v_sv_stage - 1))::numeric, 1.0);

    v_sv_raw := (v_sv_kills * 3
               + least(v_sv_survived, 185) * 8
               + least(v_sv_level, 20) * 40
               + least(v_sv_evolutions, 3) * 300
               + v_sv_elite * 50
               + (case when v_sv_boss then 800 else 0 end)
               + least(v_sv_zones, 3) * 150) * v_sv_stage_mult;
    v_sv_raw := greatest(v_sv_raw, 0);

    if abs(p_raw_score - v_sv_raw) > 0.05 * greatest(v_sv_raw, 1) then
      v_raw  := greatest(0, least(round(v_sv_raw), 2147483647))::int;
      v_meta := v_meta || jsonb_build_object(
                  'raw_adjusted', true,
                  'raw_client',   p_raw_score,
                  'raw_server',   round(v_sv_raw, 2)
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
  v_meta_unlock := coalesce((v_p.meta ->> 'survive_unlock')::int, 1);
  v_new_unlock  := v_meta_unlock;

  if v_s.game::text = 'survive' and (v_sv_zones >= 3 or v_sv_survived >= 178) then
    v_new_unlock := least(3, greatest(v_meta_unlock, v_sv_stage + 1));
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
  --     · survive  : zones_cleared ≥ 3 이거나 boss_killed = true
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
      v_e_ok := v_sv_zones >= 3 or v_sv_boss;
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
         meta = case when v_new_unlock <> v_meta_unlock
                     then jsonb_set(v_p.meta, '{survive_unlock}', to_jsonb(v_new_unlock), true)
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


-- ===== 4. 함수 실행 권한 =============================================
-- [권한] create or replace 는 기존 EXECUTE 권한을 유지하므로 사실 재부여가 필요 없다.
--        그래도 이 파일만 보고도 최종 권한을 알 수 있도록 명시적으로 다시 선언한다.
revoke execute on function public.submit_game_session(uuid, int, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_game_session(uuid, int, jsonb)
  to authenticated;
