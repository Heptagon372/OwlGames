-- =====================================================================
-- OWL GAMES — 아울러닝(OWL RUNNING) v2 대응 마이그레이션
-- 대상: Supabase / PostgreSQL 15
-- 명세: OWLRUNNING_GDD.md §11 (점수 → 포인트 연동), OWLGAMES_SPEC.md §7 공통 / §11
--
-- 이 마이그레이션이 바꾸는 것은 딱 두 가지다.
--   1) app_config 의 flight 계수(game_k) 와 시간 제한(game_limits) 확정
--   2) submit_game_session 에 flight 전용 메타 검증/원점수 재계산 단계 추가
-- 그 외 플랫폼 규칙(포인트 30~300P, 레벨/랭크/티켓, 전광판, RLS, 권한)은
-- 20260923000000_init.sql 그대로이며 여기서 건드리지 않는다.
--
-- ※ game_id enum 값은 'flight' 를 그대로 쓴다. 표시명만 "아울러닝" (GDD 머리말)
-- =====================================================================


-- ===== 1. 설정 =======================================================

-- 1.1 환산 계수 K
--   아울러닝 v2 는 원점수 스케일이 v1(생존거리 + 별×20)보다 훨씬 커졌다.
--   거리 + 통과×10×콤보배율 + 니어미스×25×콤보배율 + 아이템 점수 + 특수구간 200
--   + 남은 에너지×2 로 합산되어, 익숙한 플레이(90초·1,300m)가 raw ≈ 3,000 이 나온다.
--   K=3 을 그대로 두면 60초만 날아도 상한 300P 에 닿아 레벨 곡선이 무너진다.
--   그래서 K_flight 를 3 → 20 으로 올린다 (GDD §11.2).
--     첫 판 raw ~600 → 60P / 익숙 raw ~3,000 → 180P / 숙련 raw 9,000+ → 300P(상한)
--   typer(4)·phish(10) 는 손대지 않는다 → 그래서 통째 덮어쓰지 않고 jsonb_set 으로 flight 키만 바꾼다.
insert into public.app_config (key, value)
values ('game_k', '{"typer":4,"flight":20,"phish":10}'::jsonb)
on conflict (key) do update
   set value = jsonb_set(app_config.value, '{flight}', to_jsonb(20), true);

-- 1.2 세션 시간 제한 — flight 는 기존 값({"min_sec":3,"max_sec":185})이 그대로 정답이다.
--     (GDD §1 "숙련자 상한 180초", §13 platform.maxSessionSec = 185)
--     이미 맞으면 아무것도 하지 않고, 누가 바꿔놨으면 다시 맞춘다 (멱등).
do $$
declare
  v_flight jsonb := public.cfg('game_limits') -> 'flight';
begin
  if v_flight is null
     or (v_flight ->> 'min_sec')::numeric is distinct from 3
     or (v_flight ->> 'max_sec')::numeric is distinct from 185 then
    raise notice 'game_limits.flight 을 {"min_sec":3,"max_sec":185} 로 되돌립니다 (이전 값: %)', v_flight;
    insert into public.app_config (key, value)
    values ('game_limits',
            '{"typer":{"min_sec":10,"max_sec":65},"flight":{"min_sec":3,"max_sec":185},"phish":{"min_sec":20,"max_sec":95}}'::jsonb)
    on conflict (key) do update
       set value = jsonb_set(app_config.value, '{flight}',
                             '{"min_sec":3,"max_sec":185}'::jsonb, true);
  end if;
end $$;


-- ===== 2. 메타 숫자 파서 =============================================
-- 클라이언트 meta 는 신뢰할 수 없다. "abc" 같은 값에 ::numeric 을 걸면 예외가 터져
-- rejected 로 "커밋"하는 설계(§4.2.a)가 깨지고 트랜잭션째 에러가 나간다.
-- 그래서 숫자가 아니면 조용히 null 을 돌려주는 파서를 하나 둔다.
--   · JSON number  → 그대로
--   · JSON string  → 숫자 형태일 때만 (옛 빌드가 문자열로 보내는 경우 대비)
--   · 그 외(null/bool/array/object/키 없음) → null
create or replace function public.meta_num(p_meta jsonb, p_key text)
returns numeric
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb := p_meta -> p_key;
  t text;
begin
  if v is null then
    return null;
  end if;
  case jsonb_typeof(v)
    when 'number' then
      return v::text::numeric;
    when 'string' then
      t := btrim(v #>> '{}');
      if t ~ '^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$' then
        return t::numeric;
      end if;
      return null;
    else
      return null;
  end case;
end;
$$;

comment on function public.meta_num(jsonb, text)
  is '클라이언트 meta 에서 숫자를 안전하게 꺼낸다. 숫자가 아니면 null (예외를 던지지 않음).';


-- ===== 3. submit_game_session 재정의 =================================
-- init 마이그레이션(§4.2)의 본문을 그대로 두고 flight 전용 단계만 끼워 넣는다.
--   · 시그니처·반환 키·제네릭 검증·포인트/레벨/랭크/티켓·board_events: 전부 동일
--   · 추가되는 것: (a) flight 메타 거부 규칙  (b) flight 원점수 서버 재계산
--   · 다른 게임(typer/phish)은 v_s.game = 'flight' 가드 밖이라 동작이 이전과 완전히 같다.
--
-- [권한] create or replace 는 기존 EXECUTE 권한을 유지하므로 사실 재부여가 필요 없다.
--        그래도 이 파일만 보고도 최종 권한을 알 수 있도록 §4 에서 다시 선언한다.
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
  -- ↓ 아울러닝(flight) 전용
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
begin
  if v_uid is null then
    raise exception '로그인이 필요해요' using errcode = 'P0001';
  end if;

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
  -- 3.a 아울러닝 전용 메타 검증 (GDD §11.3)
  --   원칙: 시간은 "무조건" 서버 기준(now() - started_at)을 쓴다.
  --         클라이언트의 duration_s 는 서버 시간과 맞는지 대조하는 용도로만 쓴다.
  --         (duration_s 를 최대속도 계산에 쓰면 그 값을 부풀려 거리 검증을 통과시킬 수 있다)
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
  end if;

  -- 4.2.a 검증 실패 → rejected 로 "커밋"하고 반환 (예외를 던지지 않는다)
  if v_reason is not null then
    update public.game_sessions
       set status       = 'rejected',
           submitted_at = now(),
           raw_score    = p_raw_score,
           points       = 0,
           meta         = v_meta || jsonb_build_object('reject_reason', v_reason)
     where id = v_s.id;

    select * into v_p from public.profiles where id = v_uid;

    perform public.expire_stale();
    return jsonb_build_object(
      'status',         'rejected',
      'reason',         v_reason,
      'raw_score',      p_raw_score,
      'points',         0,
      'total_points',   v_p.total_points,
      'level_before',   v_p.level,
      'level_after',    v_p.level,
      'rank_before',    v_p.rank_idx,
      'rank_after',     v_p.rank_idx,
      'tickets_gained', 0
    );
  end if;

  -- ---------------------------------------------------------------
  -- 3.b 아울러닝 원점수 서버 재계산 (GDD §11.1 / §11.3 마지막 줄)
  --   메타가 "말이 되는" 범위 안이면 거부하지 않고, 원점수만 서버 값으로 바꾼다.
  --   클라이언트 점수가 ±5% 안이면 그대로 쓴다(부동소수점·집계 순서 차이 허용).
  --   벗어나면 서버 값을 채택하고 meta 에 흔적을 남긴다 → /admin 에서 추적 가능.
  --   클램프는 방어용이다. 여기서 막지 않으면 item_score 하나로 상한 300P 를 살 수 있다.
  --
  --   [special_bonus_score] GDD §10 특수구간 배율(COLOR RUSH 게이트 ×2 / NIGHT 니어미스 ×2 /
  --   FEATHER STORM 아이템 ×1.5 / TURBO 거리 ×2)로 "더 번" 점수의 합. §11.1 기본 공식에는
  --   배율 개념이 없어서, 이 항이 없으면 특수구간을 완주한 정상 플레이가 5% 밴드를 벗어나
  --   억울하게 하향 보정된다(TURBO 1회 = +300 ≈ raw 3,000 의 10%).
  --   상한은 구간당 800점 — 300m TURBO 가 +300, COLOR RUSH·NIGHT 가 수백 점 수준이라
  --   여유를 주되 이 필드 하나로 점수를 부풀리지는 못하게 한다.
  --   (+1) 은 완주 전(= special_cleared 에 아직 안 잡힌) 진행 중 구간 몫이다.
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
  end if;

  -- 4.2.b 포인트 계산: 30 + min(270, floor(raw / K)) → 30~300P
  v_k := (public.cfg('game_k') ->> (v_s.game::text))::numeric;
  if v_k is null or v_k <= 0 then
    raise exception '게임 설정(game_k)이 올바르지 않아요' using errcode = 'P0001';
  end if;
  v_points := 30 + least(270, floor(v_raw::numeric / v_k))::int;

  -- 프로필 잠금 (FK 검사와 충돌하지 않도록 for no key update)
  select * into v_p from public.profiles where id = v_uid for no key update;

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

  update public.profiles
     set total_points = v_total, level = v_level, rank_idx = v_rank
   where id = v_uid;

  update public.game_sessions
     set status = 'submitted', submitted_at = now(), raw_score = v_raw,
         points = v_points, meta = v_meta
   where id = v_s.id;

  perform public.expire_stale();
  return jsonb_build_object(
    'status',         'ok',
    'raw_score',      v_raw,
    'points',         v_points,
    'total_points',   v_total,
    'level_before',   v_p.level,
    'level_after',    v_level,
    'rank_before',    v_p.rank_idx,
    'rank_after',     v_rank,
    'tickets_gained', v_gained
  );
end;
$$;


-- ===== 4. 함수 실행 권한 =============================================
-- create or replace 는 권한을 유지한다 = 아래 두 줄이 없어도 결과는 같다.
-- init 마이그레이션 §9 와 동일한 상태임을 이 파일 안에서 못 박아 둔다.
revoke execute on function public.submit_game_session(uuid, int, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_game_session(uuid, int, jsonb)
  to authenticated;

-- 새 헬퍼는 RPC 내부(정의자 권한)에서만 쓴다. 클라이언트 실행 권한 없음.
revoke execute on function public.meta_num(jsonb, text)
  from public, anon, authenticated;
