-- =====================================================================
-- OWL GAMES — 아울 에너지 (OWL ENERGY) 스태미나 시스템
-- 대상: Supabase / PostgreSQL 15
-- 목적: 같은 게임을 무한 반복해 포인트를 파밍하는 것을 막는다.
--       플레이는 에너지를 소모하고(-1/판), 에너지는 10분에 1개씩 천천히 찬다.
-- 전제: 20260923000000_init.sql, 20260924000000_owlrunning.sql 적용 완료
--       (submit_game_session 은 owlrunning 버전의 flight 검증/재계산을 그대로 이어받는다)
-- =====================================================================


-- ===== 1. profiles 컬럼 추가 ========================================
alter table public.profiles
  add column owl_energy int not null default 10 check (owl_energy >= 0),
  -- 마지막 자동충전 기준 시각 (충전분만큼 앞으로 당긴다 — now()로 덮어쓰면 진행 중인 10분이 사라짐)
  add column owl_energy_at timestamptz not null default now();


-- ===== 2. 부스 지급 기록 ============================================
create table public.energy_grants (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles on delete cascade,
  staff_id   uuid references public.profiles on delete set null,
  amount     int not null check (amount between 1 and 5),
  reason     text not null,
  created_at timestamptz not null default now()
);

create index energy_grants_user_idx on public.energy_grants (user_id, created_at desc);


-- ===== 3. 설정 시드 =================================================
insert into public.app_config (key, value) values
  ('owl_energy', '{"regen_min":10,"cap":10,"hard_cap":20,"cost":1,"drop_min_phase":3,"drop_min_distance":900,"drop_daily_cap":5}'::jsonb)
on conflict (key) do nothing;


-- ===== 4. 함수 ======================================================

-- 4.1 lazy 충전 (내부 전용) — 에너지를 읽거나 소모하는 모든 RPC 의 맨 앞에서 호출한다.
--   · 프로필 행을 for update 로 잠그고, 잠긴 채로 반환한다(호출부가 이어서 같은 행을 다룰 수 있게).
--   · cap 이상이면 충전할 것이 없다 — 시계만 지금으로 당겨서(진행 중이던 게이지를 버리고) 리셋한다.
--     (부스 지급으로 cap 위·hard_cap 까지 올라간 경우도 이 분기라 자동 충전은 여기서 절대 안 넘는다)
--   · cap 미만이면 경과 10분 단위(n)만큼만 올리고, 시계는 now() 가 아니라 "소비한 구간만큼"만
--     앞으로 당긴다 — 그래야 다음 충전까지 남은 시간이 항상 10분 이하로 유지된다(진행분 보존).
--   · 그 결과 새 값이 cap 에 도달했다면 그 순간부터는 더 채울 것이 없으므로 시계를 now() 로 리셋한다.
create or replace function public.owl_energy_sync(p_user uuid)
returns int
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg    jsonb := coalesce(public.cfg('owl_energy'), '{}'::jsonb);
  v_regen  int   := coalesce((v_cfg ->> 'regen_min')::int, 10);
  v_cap    int   := coalesce((v_cfg ->> 'cap')::int, 10);
  v_energy int;
  v_at     timestamptz;
  v_n      bigint;
begin
  select owl_energy, owl_energy_at into v_energy, v_at
    from public.profiles
   where id = p_user
   for update;

  if not found then
    return null;
  end if;

  if v_energy >= v_cap then
    update public.profiles set owl_energy_at = now() where id = p_user;
    return v_energy;
  end if;

  v_n := floor(extract(epoch from (now() - v_at)) / (v_regen * 60));
  if v_n > 0 then
    v_energy := least(v_cap, v_energy + v_n::int);
    v_at     := v_at + make_interval(mins => (v_n * v_regen)::int);
    if v_energy >= v_cap then
      v_at := now();
    end if;
    update public.profiles set owl_energy = v_energy, owl_energy_at = v_at where id = p_user;
  end if;

  return v_energy;
end;
$$;

comment on function public.owl_energy_sync(uuid)
  is '내부용: lazy 아울 에너지 충전. 클라이언트 실행 권한 없음. 에너지를 읽거나 소모하는 RPC 시작 시 호출.';

-- 4.2 에너지 상태 조회 (클라이언트)
create or replace function public.owl_energy_status()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_cfg    jsonb := coalesce(public.cfg('owl_energy'), '{}'::jsonb);
  v_regen  int   := coalesce((v_cfg ->> 'regen_min')::int, 10);
  v_cap    int   := coalesce((v_cfg ->> 'cap')::int, 10);
  v_hard   int   := coalesce((v_cfg ->> 'hard_cap')::int, 20);
  v_cost   int   := coalesce((v_cfg ->> 'cost')::int, 1);
  v_energy int;
  v_at     timestamptz;
  v_next   int;
  v_full   int;
begin
  if v_uid is null then
    raise exception '로그인이 필요해요' using errcode = 'P0001';
  end if;

  v_energy := public.owl_energy_sync(v_uid);
  if v_energy is null then
    raise exception '유저를 찾을 수 없어요' using errcode = 'P0001';
  end if;

  select owl_energy_at into v_at from public.profiles where id = v_uid;

  if v_energy >= v_cap then
    v_next := 0;
    v_full := 0;
  else
    v_next := greatest(0, (v_regen * 60) - floor(extract(epoch from (now() - v_at)))::int);
    v_full := v_next + (v_cap - v_energy - 1) * v_regen * 60;
  end if;

  return jsonb_build_object(
    'energy',          v_energy,
    'cap',             v_cap,
    'hard_cap',        v_hard,
    'cost',            v_cost,
    'next_refill_sec', v_next,
    'full_in_sec',     v_full
  );
end;
$$;

-- 4.3 게임 시작 (init §4.1 재정의 — 검증 규칙은 그대로, 에너지 소모만 추가)
create or replace function public.start_game_session(p_game public.game_id)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_id     uuid;
  v_ecfg   jsonb;
  v_e_cost int;
  v_e_cap  int;
  v_energy int;
begin
  if v_uid is null then
    raise exception '로그인이 필요해요' using errcode = 'P0001';
  end if;
  if p_game is null then
    raise exception '게임을 선택해주세요' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid and verified) then
    raise exception '학번 인증 후 플레이할 수 있어요' using errcode = 'P0001';
  end if;

  if not public.is_open() then
    raise exception '지금은 운영시간이 아니에요' using errcode = 'P0001';
  end if;

  -- 아울 에너지: lazy 충전 후 소모(-cost). 부족하면 게임 자체를 시작하지 않는다.
  v_ecfg   := coalesce(public.cfg('owl_energy'), '{}'::jsonb);
  v_e_cost := coalesce((v_ecfg ->> 'cost')::int, 1);
  v_e_cap  := coalesce((v_ecfg ->> 'cap')::int, 10);
  v_energy := public.owl_energy_sync(v_uid);

  if v_energy < v_e_cost then
    raise exception '아울 에너지가 부족해요. 10분마다 1개씩 충전돼요' using errcode = 'P0001';
  end if;

  -- 소모 전 값이 이미 cap 이상이었다면(부스 지급 등) 충전 시계를 지금부터 다시 돌린다.
  update public.profiles
     set owl_energy    = owl_energy - v_e_cost,
         owl_energy_at = case when v_energy >= v_e_cap then now() else owl_energy_at end
   where id = v_uid;

  -- 기존 active 세션 정리 (유저당 1개)
  update public.game_sessions
     set status = 'expired'
   where user_id = v_uid and status = 'active';

  begin
    insert into public.game_sessions (user_id, game)
    values (v_uid, p_game)
    returning id into v_id;
  exception when unique_violation then
    raise exception '다른 기기에서 게임이 시작됐어요. 잠시 후 다시 시도해주세요' using errcode = 'P0001';
  end;

  perform public.expire_stale();
  return v_id;
end;
$$;

-- 4.4 게임 제출 (20260924_owlrunning 버전 재정의 — flight 검증/재계산은 전부 그대로 이어받고
--     아울러닝 인게임 에너지 획득만 추가한다. typer/phish 는 이전과 완전히 동일하게 동작한다)
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
  -- ↓ 아울러닝(flight) 전용 (20260924_owlrunning 과 동일)
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
  -- ↓ 아울 에너지 전용 (신규)
  v_ecfg     jsonb;      -- app_config.owl_energy
  v_e_hard   int;        -- hard_cap
  v_e_dphase numeric;    -- drop_min_phase
  v_e_ddist  numeric;    -- drop_min_distance
  v_e_dcap   int;        -- drop_daily_cap
  v_e_tz     text;       -- "오늘" 판정 타임존 (기본 Asia/Seoul)
  v_e_day0   timestamptz;
  v_e_day1   timestamptz;
  v_e_flag   boolean;    -- meta.owl_energy_found
  v_e_phase  numeric;    -- meta.phase_max
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
  -- 아울러닝 전용 메타 검증 (owlrunning §3.a 그대로)
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

  -- 검증 실패 → rejected 로 "커밋"하고 반환 (예외를 던지지 않는다)
  -- 아울 에너지는 획득 없이(0) 동기화된 현재 값만 함께 돌려준다 — 소모는 start 에서 이미 끝났다.
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
      'status',           'rejected',
      'reason',           v_reason,
      'raw_score',        p_raw_score,
      'points',           0,
      'total_points',     v_p.total_points,
      'level_before',     v_p.level,
      'level_after',      v_p.level,
      'rank_before',      v_p.rank_idx,
      'rank_after',       v_p.rank_idx,
      'tickets_gained',   0,
      'owl_energy_gained', 0,
      'owl_energy',        v_p.owl_energy
    );
  end if;

  -- ---------------------------------------------------------------
  -- 아울러닝 원점수 서버 재계산 (owlrunning §3.b 그대로)
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
  -- 아울러닝 인게임 에너지 드랍 (신규) — 드물게 고난도 구간에서 발견하는 아울 에너지.
  --   전부 만족해야 지급: flight 게임 · 거부되지 않음(이 지점에 도달) ·
  --   meta.owl_energy_found=true · phase_max ≥ drop_min_phase · distance_m ≥ drop_min_distance ·
  --   오늘(Asia/Seoul 기준) 인게임 드랍이 drop_daily_cap 미만.
  --   hard_cap 을 넘지 않도록 자르되, "드랍을 발견했다"는 사실 자체는 owl_energy_gained=1 로
  --   보고하고 daily cap 도 그대로 소모한다 — 이미 가득 찬 상태에서 주운 것도 정상 플레이라
  --   보상 없이 조용히 무시하기보다는 "찾았다"는 피드백을 그대로 주는 쪽을 택했다.
  --   distance_m 은 바로 위에서 물리 검증까지 마친 v_f_dist(0 이상으로 정리된 값)를 그대로 쓴다.
  -- ---------------------------------------------------------------
  if v_s.game = 'flight' then
    v_e_flag  := coalesce((v_meta -> 'owl_energy_found') = to_jsonb(true), false);
    v_e_phase := public.meta_num(v_meta, 'phase_max');

    if v_e_flag
       and v_e_phase is not null and v_e_phase >= v_e_dphase
       and v_f_dist  is not null and v_f_dist  >= v_e_ddist
    then
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
  end if;

  v_e_final := least(v_e_hard, v_p.owl_energy + v_e_gained);

  update public.profiles
     set total_points = v_total, level = v_level, rank_idx = v_rank, owl_energy = v_e_final
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
    'owl_energy',        v_e_final
  );
end;
$$;

-- 4.5 부스: 미션 보상 에너지 지급 (staff) — cap(10) 위로도 올릴 수 있다, 상한은 hard_cap(20)
create or replace function public.booth_grant_energy(p_student_id text, p_amount int, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_staff  uuid := auth.uid();
  v_sid    text := btrim(coalesce(p_student_id, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_p      public.profiles%rowtype;
  v_hard   int;
  v_energy int;
  v_new    int;
  v_added  int;
begin
  if not public.is_staff() then
    raise exception '부원 권한이 필요해요' using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount < 1 or p_amount > 5 then
    raise exception '지급 개수는 1~5개예요' using errcode = 'P0001';
  end if;
  if v_reason = '' or char_length(v_reason) > 40 then
    raise exception '지급 사유를 적어주세요' using errcode = 'P0001';
  end if;

  select * into v_p from public.profiles where student_id = v_sid;
  if not found then
    raise exception '학번을 찾을 수 없어요' using errcode = 'P0001';
  end if;

  v_hard   := coalesce((public.cfg('owl_energy') ->> 'hard_cap')::int, 20);
  v_energy := public.owl_energy_sync(v_p.id);

  if v_energy >= v_hard then
    raise exception '이미 에너지가 가득 찼어요' using errcode = 'P0001';
  end if;

  v_new   := least(v_hard, v_energy + p_amount);
  v_added := v_new - v_energy;

  update public.profiles set owl_energy = v_new where id = v_p.id;

  -- amount 는 스태프가 실제로 승인한 지급량(미션 보상 단위)을 기록한다.
  -- hard_cap 클램프로 실제 반영된 양은 반환값 granted 로 따로 알려준다.
  insert into public.energy_grants (user_id, staff_id, amount, reason)
  values (v_p.id, v_staff, p_amount, v_reason);

  return jsonb_build_object(
    'user_id',    v_p.id,
    'name',       v_p.name,
    'student_id', v_p.student_id,
    'energy',     v_new,
    'granted',    v_added
  );
end;
$$;

-- 4.6 관리자: 현장 보정용 강제 설정 (0..hard_cap 으로 clamp)
create or replace function public.admin_set_energy(p_user_id uuid, p_value int)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_hard int := coalesce((public.cfg('owl_energy') ->> 'hard_cap')::int, 20);
  v_val  int;
begin
  if not public.is_admin() then
    raise exception '관리자 권한이 필요해요' using errcode = 'P0001';
  end if;
  if p_value is null then
    raise exception '에너지 값을 입력해주세요' using errcode = 'P0001';
  end if;

  v_val := greatest(0, least(v_hard, p_value));

  -- 강제 보정은 진행 중이던 충전 게이지를 신뢰하지 않는다 — 시계도 지금으로 리셋한다.
  update public.profiles
     set owl_energy = v_val, owl_energy_at = now()
   where id = p_user_id;
  if not found then
    raise exception '유저를 찾을 수 없어요' using errcode = 'P0001';
  end if;
end;
$$;


-- ===== 5. RLS =======================================================
alter table public.energy_grants enable row level security;

create policy energy_grants_select on public.energy_grants
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));
-- insert/update/delete 정책 없음 = 클라이언트 직접 쓰기 불가 (RPC 경유만 가능)


-- ===== 6. 테이블 권한 ================================================
revoke all on table public.energy_grants from anon, authenticated;
grant select on table public.energy_grants to authenticated;

-- 시퀀스는 RPC(정의자 권한)로만 쓴다
revoke all on sequence public.energy_grants_id_seq from anon, authenticated;


-- ===== 7. 함수 실행 권한 =============================================
-- [권한] create or replace 는 기존 EXECUTE 권한을 유지하므로 start_game_session /
-- submit_game_session 은 사실 재부여가 필요 없다. 그래도 이 파일만 보고도 최종 권한을
-- 알 수 있도록 명시적으로 다시 선언한다 (init §9 와 동일 상태).
revoke execute on function
  public.owl_energy_sync(uuid),
  public.owl_energy_status(),
  public.start_game_session(public.game_id),
  public.submit_game_session(uuid, int, jsonb),
  public.booth_grant_energy(text, int, text),
  public.admin_set_energy(uuid, int)
  from public, anon, authenticated;

-- 내부 전용: 클라이언트 실행 권한 없음
-- (owl_energy_sync 는 위 revoke 로 이미 아무도 실행할 수 없다 — 명시적으로만 남겨둔다)

grant execute on function
  public.owl_energy_status(),
  public.start_game_session(public.game_id),
  public.submit_game_session(uuid, int, jsonb),
  public.booth_grant_energy(text, int, text),  -- 내부에서 is_staff() 검사
  public.admin_set_energy(uuid, int)            -- 내부에서 is_admin() 검사
  to authenticated;
