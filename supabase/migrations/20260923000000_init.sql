-- =====================================================================
-- OWL GAMES (아울게임즈) — 초기 마이그레이션
-- 대상: Supabase / PostgreSQL 15
-- 원칙: 점수·포인트·레벨·티켓·추첨은 전부 security definer RPC에서만 처리한다.
--       클라이언트(anon/authenticated)는 private 테이블에 직접 쓰기 불가.
-- 명세: OWLGAMES_SPEC.md §3, §5, §6, §7, §8~§11, §14, §15
-- =====================================================================


-- ===== 0. 확장 =====================================================
-- 모든 함수가 search_path 를 고정하므로 extensions.gen_random_bytes(n) 로 호출한다.
create extension if not exists pgcrypto with schema extensions;


-- ===== 1. 타입 =====================================================
create type public.user_role as enum ('user', 'staff', 'admin');
create type public.game_id   as enum ('typer', 'flight', 'phish');


-- ===== 2. 테이블 ===================================================

-- 2.1 프로필 (auth.users 1:1)
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  name         text not null,
  student_id   text not null unique,
  role         public.user_role not null default 'user',
  verified     boolean not null default false,
  total_points int not null default 0 check (total_points >= 0),
  level        int not null default 1 check (level between 1 and 100),
  rank_idx     int not null default 0 check (rank_idx between 0 and 16),
  created_at   timestamptz not null default now()
);

-- 랭킹 뷰용
create index profiles_points_idx on public.profiles (total_points desc, created_at asc);

-- 2.2 게임 세션
create table public.game_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  game         public.game_id not null,
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  raw_score    int,
  points       int,
  meta         jsonb,
  status       text not null default 'active'
               check (status in ('active', 'submitted', 'rejected', 'expired'))
);

-- 유저당 active 세션 1개 (§11 어뷰징 방어)
create unique index one_active_session on public.game_sessions (user_id) where status = 'active';
create index game_sessions_user_idx      on public.game_sessions (user_id, submitted_at desc);
create index game_sessions_submitted_idx on public.game_sessions (submitted_at) where status = 'submitted';
create index game_sessions_best_idx      on public.game_sessions (game, raw_score desc) where status = 'submitted';

-- 2.3 뽑기 코드
create table public.redeem_codes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  -- 혼동문자(0/O/1/I) 제외 32자 알파벳
  code         text not null check (code ~ '^[2-9A-HJ-NP-Z]{6}$'),
  ticket_count int not null check (ticket_count between 1 and 16),
  expires_at   timestamptz not null,
  status       text not null default 'active'
               check (status in ('active', 'used', 'expired', 'revoked')),
  created_at   timestamptz not null default now()
);

create unique index active_code            on public.redeem_codes (code)    where status = 'active';
-- 활성 코드는 유저당 1개 (§8.1)
create unique index one_active_code_per_user on public.redeem_codes (user_id) where status = 'active';
create index redeem_codes_user_idx         on public.redeem_codes (user_id, created_at desc);
create index redeem_codes_expiry_idx       on public.redeem_codes (expires_at) where status = 'active';

-- 2.4 티켓 (랭크업 1회 = 1장, 유저당 최대 16장)
create table public.tickets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  earned_rank_idx int not null check (earned_rank_idx between 1 and 16),
  status          text not null default 'unused' check (status in ('unused', 'reserved', 'used')),
  -- 스펙 초안과 달리 on delete set null (유저 삭제 cascade 순서 문제 방지)
  redeem_code_id  uuid references public.redeem_codes (id) on delete set null,
  created_at      timestamptz not null default now(),
  used_at         timestamptz,
  -- 랭크당 1장 → 구조적으로 1인 최대 16장 보장 (§5.3)
  constraint tickets_one_per_rank unique (user_id, earned_rank_idx)
);

create index tickets_user_status_idx on public.tickets (user_id, status);
create index tickets_code_idx        on public.tickets (redeem_code_id) where redeem_code_id is not null;

-- 2.5 상품 (재고)
create table public.prizes (
  place int primary key check (place between 1 and 5),
  name  text not null,
  stock int not null check (stock >= 0)
);

-- 2.6 추첨 기록
create table public.draws (
  id         uuid primary key default gen_random_uuid(),
  -- 스펙 초안과 달리 cascade: 유저 삭제 시 티켓/프로필과 함께 정리
  ticket_id  uuid not null unique references public.tickets (id)  on delete cascade,
  user_id    uuid not null references public.profiles (id)        on delete cascade,
  rank_idx   int not null check (rank_idx between 0 and 16),
  tier       int not null check (tier between 1 and 6),
  place      int references public.prizes (place),   -- null = 꽝
  -- 스펙 초안과 달리 nullable + set null: 부원 계정 삭제가 실패하지 않도록
  staff_id   uuid references public.profiles (id) on delete set null,
  claimed    boolean not null default false,
  claimed_at timestamptz,
  drawn_at   timestamptz not null default now()
);

create index draws_drawn_idx     on public.draws (drawn_at desc);
create index draws_user_idx      on public.draws (user_id, drawn_at desc);
create index draws_staff_idx     on public.draws (staff_id);
create index draws_unclaimed_idx on public.draws (drawn_at desc) where place is not null and not claimed;

-- 2.7 랭크업 이벤트
create table public.rank_events (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  from_rank  int not null,
  to_rank    int not null,
  created_at timestamptz not null default now()
);

create index rank_events_user_idx on public.rank_events (user_id, created_at desc);

-- 2.8 설정
create table public.app_config (
  key   text primary key,
  value jsonb not null
);

-- 2.9 전광판 공개 피드 (/board 가 private 테이블을 구독하지 않도록 분리)
create table public.board_events (
  id          bigserial primary key,
  kind        text not null check (kind in ('draw', 'rank_up')),
  masked_name text not null,
  rank_idx    int,          -- rank_up: 도달 랭크 / draw: 뽑은 시점 랭크
  place       int,          -- draw 전용, null = 꽝
  prize_name  text,         -- draw 전용
  created_at  timestamptz not null default now()
);

create index board_events_created_idx on public.board_events (created_at desc);


-- ===== 3. 헬퍼 함수 ================================================
-- 전부 security definer + search_path 고정. 클라이언트 실행권한은 §9 에서 조정.

-- 3.1 이름 마스킹: 1자 → 그대로, 2자 → 앞+*, 3자 이상 → 앞+**…+뒤
create or replace function public.mask_name(p text)
returns text
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p is null                then null
    when char_length(p) <= 1      then p
    when char_length(p)  = 2      then left(p, 1) || '*'
    else left(p, 1) || repeat('*', char_length(p) - 2) || right(p, 1)
  end
$$;

-- 3.2 설정 조회
create or replace function public.cfg(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select value from public.app_config where key = p_key
$$;

-- 3.3 권한 체크 (RLS 에서 사용)
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role in ('staff', 'admin')
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'admin'
  )
$$;

-- 3.4 운영시간 판정 (open_hours + force_open)
create or replace function public.is_open()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_force text  := coalesce(public.cfg('force_open') #>> '{}', 'auto');
  v_hours jsonb := coalesce(public.cfg('open_hours'), '{}'::jsonb);
  v_tz    text  := coalesce(v_hours ->> 'tz', 'Asia/Seoul');
  v_start time  := coalesce(v_hours ->> 'start', '09:00')::time;
  v_end   time  := coalesce(v_hours ->> 'end',   '18:00')::time;
  v_now   time  := (now() at time zone v_tz)::time;
begin
  if v_force = 'open'   then return true;  end if;
  if v_force = 'closed' then return false; end if;
  if v_start <= v_end then
    return v_now >= v_start and v_now < v_end;
  end if;
  -- 자정을 넘기는 구간 (예: 22:00~02:00)
  return v_now >= v_start or v_now < v_end;
end;
$$;

-- 3.5 레벨/랭크 수학 (프론트 lib/rank.ts 와 동일해야 함)

-- 레벨 L 도달 누적 포인트 = base*(L-1) + step*(L-1)*L/2  → Lv100 = 27,720
create or replace function public.level_cum_points(l int)
returns int
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_curve jsonb := coalesce(public.cfg('level_curve'), '{}'::jsonb);
  v_base  int   := coalesce((v_curve ->> 'base')::int, 30);
  v_step  int   := coalesce((v_curve ->> 'step')::int, 5);
  v_l     int   := greatest(1, least(100, coalesce(l, 1)));
begin
  -- (v_l-1)*v_l 은 항상 짝수라 정수 나눗셈이 정확하다
  return v_base * (v_l - 1) + v_step * (v_l - 1) * v_l / 2;
end;
$$;

-- 누적 포인트 → 레벨 (cum(L) <= p 인 최대 L, 상한 100)
create or replace function public.level_from_points(p int)
returns int
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_curve jsonb := coalesce(public.cfg('level_curve'), '{}'::jsonb);
  v_base  int   := coalesce((v_curve ->> 'base')::int, 30);
  v_step  int   := coalesce((v_curve ->> 'step')::int, 5);
  v_p     int   := greatest(0, coalesce(p, 0));
begin
  for v_l in reverse 100..2 loop
    -- level_cum_points 와 동일 공식 (설정 재조회를 피하려고 인라인)
    if v_p >= v_base * (v_l - 1) + v_step * (v_l - 1) * v_l / 2 then
      return v_l;
    end if;
  end loop;
  return 1;
end;
$$;

-- 레벨 → 랭크 idx (0~16, §5.2)
create or replace function public.rank_from_level(l int)
returns int
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(max(t.idx - 1), 0)::int
    from unnest(array[1, 8, 15, 22, 28, 34, 40, 46, 52, 58, 64, 70, 76, 82, 88, 94, 100])
         with ordinality as t(min_level, idx)
   where t.min_level <= l
$$;

-- 랭크 idx → 뽑기 티어 (§5.2)
create or replace function public.tier_from_rank(r int)
returns int
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select case
    when r is null then 1
    when r >= 16 then 6
    when r >= 12 then 5
    when r >=  9 then 4
    when r >=  6 then 3
    when r >=  3 then 2
    else 1
  end
$$;

-- 3.6 추첨 난수: 6바이트(48비트) → [0,100) 균등
create or replace function public.gacha_roll()
returns numeric
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_b bytea  := extensions.gen_random_bytes(6);
  v_n bigint := 0;
begin
  for i in 0..5 loop
    v_n := v_n * 256 + get_byte(v_b, i);
  end loop;
  return v_n::numeric * 100 / 281474976710656;  -- 2^48
end;
$$;

-- 3.7 등수 선택 (순수 함수 + 재고만 조회)
--     재고 0인 등수는 꽝으로 흡수하고 상위/하위로 재분배하지 않는다 (§6 추첨규칙 2)
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
begin
  if v_row is null or jsonb_typeof(v_row) <> 'array' then
    raise exception '뽑기 확률표 설정이 올바르지 않아요 (T%)', p_tier using errcode = 'P0001';
  end if;

  for k in 1..5 loop
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

-- 3.8 만료 정리 (코드·세션)
--   · pg_cron(1분)으로도, RPC 끝에서 lazy 로도 호출 가능.
--   · for update skip locked: 다른 트랜잭션이 잡고 있는 행은 건너뛰어 대기/교착을 만들지 않는다.
create or replace function public.expire_stale()
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_limits jsonb := coalesce(public.cfg('game_limits'), '{}'::jsonb);
begin
  -- (a) 만료 코드 → expired, 묶여 있던 reserved 티켓은 unused 로 복귀
  with expired as (
    update public.redeem_codes c
       set status = 'expired'
     where c.status = 'active'
       and c.id in (
         select id from public.redeem_codes
          where status = 'active' and expires_at < now()
          for update skip locked
       )
    returning c.id
  )
  update public.tickets t
     set status = 'unused', redeem_code_id = null
    from expired e
   where t.redeem_code_id = e.id
     and t.status = 'reserved';

  -- (b) 방치된 active 세션 → expired (게임별 max_sec + 60초)
  update public.game_sessions gs
     set status = 'expired'
   where gs.status = 'active'
     and gs.id in (
       select s.id from public.game_sessions s
        where s.status = 'active'
          and s.started_at < now() - make_interval(secs =>
                coalesce(((v_limits -> (s.game::text)) ->> 'max_sec')::double precision, 600) + 60)
        for update skip locked
     );
end;
$$;


-- ===== 4. 클라이언트 RPC ===========================================
-- 반환 JSON 키는 프론트와의 계약이다. 변경 시 프론트도 함께 수정할 것.
-- 사용자 노출 오류는 전부 한국어 + errcode P0001 (프론트가 error.message 를 그대로 표시).
--
-- [설계 메모] expire_stale() 는 각 RPC의 "끝"에서 호출한다.
--   시작 시점에 호출하면 정리용 행 잠금(다른 유저의 stale 행)을 트랜잭션 끝까지 들고
--   있는 상태에서 본 작업이 자기 행을 기다리게 되어, 동시 호출 간 교착이 발생할 수 있다.
--   (예: 두 유저가 각자 방치 세션을 둔 채 동시에 start_game_session)
--   만료 여부 판단은 각 RPC 안에서 expires_at / 경과시간으로 명시적으로 하므로 동작은 동일하다.

-- 4.1 게임 시작
create or replace function public.start_game_session(p_game public.game_id)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
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

-- 4.2 게임 제출 (포인트·레벨·랭크·티켓 반영)
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

  -- 4.2.b 포인트 계산: 30 + min(270, floor(raw / K)) → 30~300P
  v_k := (public.cfg('game_k') ->> (v_s.game::text))::numeric;
  if v_k is null or v_k <= 0 then
    raise exception '게임 설정(game_k)이 올바르지 않아요' using errcode = 'P0001';
  end if;
  v_points := 30 + least(270, floor(p_raw_score::numeric / v_k))::int;

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
     set status = 'submitted', submitted_at = now(), raw_score = p_raw_score,
         points = v_points, meta = v_meta
   where id = v_s.id;

  perform public.expire_stale();
  return jsonb_build_object(
    'status',         'ok',
    'raw_score',      p_raw_score,
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

-- 4.3 뽑기 코드 발급
create or replace function public.issue_redeem_code(p_count int)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  c_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';  -- 0/O/1/I 제외 32자
  v_uid      uuid := auth.uid();
  v_unused   int;
  v_reserved int;
  v_ttl      int;
  v_expires  timestamptz;
  v_code     text;
  v_code_id  uuid;
  v_bytes    bytea;
  v_attempt  int := 0;
begin
  if v_uid is null then
    raise exception '로그인이 필요해요' using errcode = 'P0001';
  end if;

  -- 같은 유저의 동시 발급 직렬화 (다른 잠금보다 먼저 잡는다)
  perform pg_advisory_xact_lock(hashtextextended('owl:issue:' || v_uid::text, 0));

  if not exists (select 1 from public.profiles where id = v_uid and verified) then
    raise exception '학번 인증 후 이용할 수 있어요' using errcode = 'P0001';
  end if;

  -- 기존 active 코드 무효화 + 묶였던 티켓 복귀 (만료 여부와 무관)
  with revoked as (
    update public.redeem_codes
       set status = 'revoked'
     where user_id = v_uid and status = 'active'
    returning id
  )
  update public.tickets t
     set status = 'unused', redeem_code_id = null
    from revoked r
   where t.redeem_code_id = r.id
     and t.status = 'reserved';

  select count(*) into v_unused
    from public.tickets where user_id = v_uid and status = 'unused';

  if p_count is null or p_count < 1 or p_count > v_unused then
    raise exception '사용할 티켓 수를 확인해주세요' using errcode = 'P0001';
  end if;

  v_ttl     := coalesce((public.cfg('redeem_code_ttl_min') #>> '{}')::int, 10);
  v_expires := now() + make_interval(mins => v_ttl);

  -- 코드 생성 (256 = 32×8 이므로 byte % 32 는 편향 없음). 충돌 시 재시도.
  loop
    v_attempt := v_attempt + 1;
    v_bytes := extensions.gen_random_bytes(6);
    v_code  := '';
    for i in 0..5 loop
      v_code := v_code || substr(c_alphabet, get_byte(v_bytes, i) % 32 + 1, 1);
    end loop;

    begin
      insert into public.redeem_codes (user_id, code, ticket_count, expires_at)
      values (v_uid, v_code, p_count, v_expires)
      returning id into v_code_id;
      exit;
    exception when unique_violation then
      if v_attempt >= 10 then
        raise exception '코드 발급에 실패했어요. 다시 시도해주세요' using errcode = 'P0001';
      end if;
    end;
  end loop;

  -- 오래된 티켓부터 reserved
  update public.tickets
     set status = 'reserved', redeem_code_id = v_code_id
   where status = 'unused'
     and id in (
       select id from public.tickets
        where user_id = v_uid and status = 'unused'
        order by created_at, earned_rank_idx
        limit p_count
        for update
     );
  get diagnostics v_reserved = row_count;

  if v_reserved <> p_count then
    raise exception '사용할 티켓 수를 확인해주세요' using errcode = 'P0001';
  end if;

  perform public.expire_stale();
  return jsonb_build_object(
    'code',         v_code,
    'ticket_count', p_count,
    'expires_at',   v_expires
  );
end;
$$;

-- 4.4 부스: 코드 조회 (학생증 대조용 — 이름·학번 전체 노출, staff 전용)
create or replace function public.booth_lookup_code(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_code      text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  v_c         public.redeem_codes%rowtype;
  v_p         public.profiles%rowtype;
  v_remaining int;
begin
  if not public.is_staff() then
    raise exception '부원 권한이 필요해요' using errcode = 'P0001';
  end if;

  select * into v_c
    from public.redeem_codes
   where code = v_code and status = 'active' and expires_at >= now();
  if not found then
    raise exception '코드를 찾을 수 없어요 (만료되었거나 이미 사용됨)' using errcode = 'P0001';
  end if;

  select * into v_p from public.profiles where id = v_c.user_id;

  select count(*) into v_remaining
    from public.tickets where redeem_code_id = v_c.id and status = 'reserved';

  perform public.expire_stale();
  return jsonb_build_object(
    'code_id',    v_c.id,
    'code',       v_c.code,
    'user_id',    v_p.id,
    'name',       v_p.name,
    'student_id', v_p.student_id,
    'rank_idx',   v_p.rank_idx,
    'level',      v_p.level,
    'tier',       public.tier_from_rank(v_p.rank_idx),
    'remaining',  v_remaining,
    'expires_at', v_c.expires_at
  );
end;
$$;

-- 4.5 부스: 추첨 1회 (티켓 소모 → 추첨 → 재고 차감 → 기록, 한 트랜잭션)
--   · 잠금 순서: 코드 → 티켓 → (프로필 읽기) → 상품(place 순) — 교착 방지
--   · 만료 정책: 코드 만료시각이 지나면 뽑을 수 없다. 만료 연장은 하지 않는다.
--     (남은 티켓은 만료 정리 시 unused 로 돌아가므로 유저가 코드를 재발급하면 된다)
create or replace function public.booth_draw(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_code      text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  v_staff     uuid := auth.uid();
  v_c         public.redeem_codes%rowtype;
  v_p         public.profiles%rowtype;
  v_ticket_id uuid;
  v_tier      int;
  v_roll      numeric;
  v_place     int;
  v_prize     text;
  v_draw_id   uuid;
  v_remaining int;
begin
  if not public.is_staff() then
    raise exception '부원 권한이 필요해요' using errcode = 'P0001';
  end if;

  select * into v_c
    from public.redeem_codes
   where code = v_code and status = 'active'
   for update;
  if not found or v_c.expires_at < now() then
    raise exception '코드를 찾을 수 없어요 (만료되었거나 이미 사용됨)' using errcode = 'P0001';
  end if;

  select id into v_ticket_id
    from public.tickets
   where redeem_code_id = v_c.id and status = 'reserved'
   order by created_at, earned_rank_idx
   limit 1
   for update;
  if v_ticket_id is null then
    raise exception '남은 뽑기가 없어요' using errcode = 'P0001';
  end if;

  -- 뽑는 시점의 현재 랭크 기준 (§5.3)
  select * into v_p from public.profiles where id = v_c.user_id;
  v_tier := public.tier_from_rank(v_p.rank_idx);

  -- 상품 5행을 place 순서로 잠근다 (재고 차감 경합 직렬화)
  perform 1 from public.prizes order by place for update;

  v_roll  := public.gacha_roll();
  v_place := public.gacha_pick(v_tier, v_roll, true);

  if v_place is not null then
    update public.prizes set stock = stock - 1 where place = v_place
    returning name into v_prize;
  end if;

  update public.tickets set status = 'used', used_at = now() where id = v_ticket_id;

  insert into public.draws (ticket_id, user_id, rank_idx, tier, place, staff_id)
  values (v_ticket_id, v_p.id, v_p.rank_idx, v_tier, v_place, v_staff)
  returning id into v_draw_id;

  -- 꽝은 전광판에 띄우지 않는다
  if v_place is not null then
    insert into public.board_events (kind, masked_name, rank_idx, place, prize_name)
    values ('draw', public.mask_name(v_p.name), v_p.rank_idx, v_place, v_prize);
  end if;

  select count(*) into v_remaining
    from public.tickets where redeem_code_id = v_c.id and status = 'reserved';

  if v_remaining = 0 then
    update public.redeem_codes set status = 'used' where id = v_c.id;
  end if;

  perform public.expire_stale();
  return jsonb_build_object(
    'draw_id',    v_draw_id,
    'place',      v_place,
    'prize_name', v_prize,
    'tier',       v_tier,
    'rank_idx',   v_p.rank_idx,
    'remaining',  v_remaining
  );
end;
$$;

-- 4.6 부스: 상품 수령 처리
create or replace function public.booth_mark_claimed(p_draw_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_place int;
  v_found boolean;
begin
  if not public.is_staff() then
    raise exception '부원 권한이 필요해요' using errcode = 'P0001';
  end if;

  select place into v_place from public.draws where id = p_draw_id for update;
  if not found then
    raise exception '뽑기 기록을 찾을 수 없어요' using errcode = 'P0001';
  end if;
  if v_place is null then
    raise exception '꽝은 수령할 상품이 없어요' using errcode = 'P0001';
  end if;

  update public.draws
     set claimed = true, claimed_at = coalesce(claimed_at, now())
   where id = p_draw_id;
end;
$$;

-- 4.7 가입 승인 (staff+)
create or replace function public.admin_verify_user(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_staff() then
    raise exception '부원 권한이 필요해요' using errcode = 'P0001';
  end if;

  update public.profiles set verified = true where id = p_user_id;
  if not found then
    raise exception '유저를 찾을 수 없어요' using errcode = 'P0001';
  end if;
end;
$$;

-- 4.8 계정 삭제 (admin, 학번 중복 해결용) — auth.users 삭제 → 전부 cascade
create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception '관리자 권한이 필요해요' using errcode = 'P0001';
  end if;
  if p_user_id is null then
    raise exception '유저를 찾을 수 없어요' using errcode = 'P0001';
  end if;
  if p_user_id = auth.uid() then
    raise exception '본인 계정은 삭제할 수 없어요' using errcode = 'P0001';
  end if;

  delete from auth.users where id = p_user_id;
  if not found then
    raise exception '유저를 찾을 수 없어요' using errcode = 'P0001';
  end if;
end;
$$;

-- 4.9 역할 변경 (admin)
create or replace function public.admin_set_role(p_user_id uuid, p_role public.user_role)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception '관리자 권한이 필요해요' using errcode = 'P0001';
  end if;
  if p_role is null then
    raise exception '역할을 선택해주세요' using errcode = 'P0001';
  end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception '본인의 관리자 권한은 해제할 수 없어요' using errcode = 'P0001';
  end if;

  -- 부원·관리자는 바로 사용할 수 있도록 인증 처리도 함께 (강등 시 verified 는 유지)
  update public.profiles
     set role = p_role,
         verified = verified or p_role in ('staff', 'admin')
   where id = p_user_id;
  if not found then
    raise exception '유저를 찾을 수 없어요' using errcode = 'P0001';
  end if;
end;
$$;

-- 4.10 운영시간 강제 모드 (admin)
create or replace function public.admin_set_force_open(p_mode text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception '관리자 권한이 필요해요' using errcode = 'P0001';
  end if;
  if p_mode is null or p_mode not in ('auto', 'open', 'closed') then
    raise exception '운영 모드는 auto / open / closed 중 하나예요' using errcode = 'P0001';
  end if;

  insert into public.app_config (key, value)
  values ('force_open', to_jsonb(p_mode))
  on conflict (key) do update set value = excluded.value;
end;
$$;

-- 4.11 재고 수정 (admin)
create or replace function public.admin_set_stock(p_place int, p_stock int)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception '관리자 권한이 필요해요' using errcode = 'P0001';
  end if;
  if p_stock is null or p_stock < 0 then
    raise exception '재고는 0 이상이어야 해요' using errcode = 'P0001';
  end if;

  update public.prizes set stock = p_stock where place = p_place;
  if not found then
    raise exception '상품을 찾을 수 없어요' using errcode = 'P0001';
  end if;
end;
$$;

-- 4.12 전광판 오늘 통계 (공개)
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

  select count(*) into v_challengers from public.profiles where rank_idx = 16;

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


-- ===== 5. 가입 트리거 ==============================================
-- auth.users INSERT → profiles 생성. 이름/학번이 없으면 예외를 던져 가입 자체를 실패시킨다.
-- 학번 unique 이므로 중복 학번 가입도 여기서 실패한다(의도).
-- 참고: 가입 이메일이 `${student_id}@owlgames.local` 이라 실제로는 GoTrue 가
--       "User already registered" 로 먼저 막는 경우가 많다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name    text := btrim(new.raw_user_meta_data ->> 'name');
  v_sid     text := btrim(new.raw_user_meta_data ->> 'student_id');
  v_pattern text := coalesce(public.cfg('student_id_pattern') #>> '{}', '^[0-9]{9}$');
begin
  if v_name is null or v_name = '' or v_sid is null or v_sid = '' then
    raise exception '이름과 학번이 필요해요' using errcode = 'P0001';
  end if;
  if char_length(v_name) > 20 then
    raise exception '이름이 너무 길어요' using errcode = 'P0001';
  end if;
  if v_sid !~ v_pattern then
    raise exception '학번 형식이 올바르지 않아요' using errcode = 'P0001';
  end if;

  insert into public.profiles (id, name, student_id) values (new.id, v_name, v_sid);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ===== 6. 뷰 (공개 랭킹) ===========================================
-- security_invoker 를 켜지 않는다 = 뷰 소유자(postgres) 권한으로 읽어 profiles RLS 를
-- 의도적으로 우회한다. 학번·실명은 절대 노출하지 않는다.

create or replace view public.leaderboard as
  select p.id                  as user_id,
         public.mask_name(p.name) as masked_name,
         p.rank_idx,
         p.level,
         p.total_points,
         row_number() over (order by p.total_points desc, p.created_at asc) as position
    from public.profiles p
   where p.verified;

create or replace view public.game_bests as
  with best as (
    select distinct on (s.game, s.user_id)
           s.game, s.user_id, s.raw_score as best_score, s.submitted_at as achieved_at
      from public.game_sessions s
      join public.profiles p on p.id = s.user_id
     where s.status = 'submitted' and p.verified
     order by s.game, s.user_id, s.raw_score desc, s.submitted_at asc
  )
  select b.game,
         b.user_id,
         public.mask_name(p.name) as masked_name,
         p.rank_idx,
         b.best_score,
         row_number() over (partition by b.game
                            order by b.best_score desc, b.achieved_at asc) as position
    from best b
    join public.profiles p on p.id = b.user_id;


-- ===== 7. RLS ======================================================
alter table public.profiles      enable row level security;
alter table public.game_sessions enable row level security;
alter table public.redeem_codes  enable row level security;
alter table public.tickets       enable row level security;
alter table public.prizes        enable row level security;
alter table public.draws         enable row level security;
alter table public.rank_events   enable row level security;
alter table public.app_config    enable row level security;
alter table public.board_events  enable row level security;

-- 본인 또는 부원만 조회. 쓰기 정책은 없음(= RPC 경유만 가능).
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));

create policy game_sessions_select on public.game_sessions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

create policy redeem_codes_select on public.redeem_codes
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

create policy tickets_select on public.tickets
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

create policy draws_select on public.draws
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

create policy rank_events_select on public.rank_events
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

-- 재고·설정·전광판 피드는 공개
create policy prizes_select on public.prizes
  for select to anon, authenticated using (true);
create policy prizes_update_admin on public.prizes
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy app_config_select on public.app_config
  for select to anon, authenticated using (true);
create policy app_config_insert_admin on public.app_config
  for insert to authenticated with check ((select public.is_admin()));
create policy app_config_update_admin on public.app_config
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy board_events_select on public.board_events
  for select to anon, authenticated using (true);


-- ===== 8. 테이블 권한 (defense in depth) ===========================
grant usage on schema public to anon, authenticated;

-- private 테이블: anon 은 접근 불가, authenticated 는 select 만 (RLS 로 본인/부원 제한)
revoke all on table
  public.profiles, public.game_sessions, public.redeem_codes,
  public.tickets, public.draws, public.rank_events
  from anon, authenticated;
grant select on table
  public.profiles, public.game_sessions, public.redeem_codes,
  public.tickets, public.draws, public.rank_events
  to authenticated;

-- 공개 테이블
revoke all on table public.prizes, public.app_config, public.board_events from anon, authenticated;
grant select on table public.prizes, public.app_config, public.board_events to anon, authenticated;
grant update (name, stock) on table public.prizes to authenticated;      -- RLS 로 admin 만
grant insert, update on table public.app_config to authenticated;        -- RLS 로 admin 만

-- 뷰
revoke all on table public.leaderboard, public.game_bests from anon, authenticated;
grant select on table public.leaderboard, public.game_bests to anon, authenticated;

-- 시퀀스는 RPC(정의자 권한)로만 쓴다
revoke all on sequence public.rank_events_id_seq, public.board_events_id_seq from anon, authenticated;


-- ===== 9. 함수 실행 권한 ===========================================
revoke execute on function
  public.mask_name(text),
  public.cfg(text),
  public.is_staff(),
  public.is_admin(),
  public.is_open(),
  public.level_cum_points(int),
  public.level_from_points(int),
  public.rank_from_level(int),
  public.tier_from_rank(int),
  public.gacha_roll(),
  public.gacha_pick(int, numeric, boolean),
  public.expire_stale(),
  public.handle_new_user(),
  public.start_game_session(public.game_id),
  public.submit_game_session(uuid, int, jsonb),
  public.issue_redeem_code(int),
  public.booth_lookup_code(text),
  public.booth_draw(text),
  public.booth_mark_claimed(uuid),
  public.admin_verify_user(uuid),
  public.admin_delete_user(uuid),
  public.admin_set_role(uuid, public.user_role),
  public.admin_set_force_open(text),
  public.admin_set_stock(int, int),
  public.board_stats()
  from public, anon, authenticated;

-- 공개(익명 포함) — 순수 계산·공개 정보만
grant execute on function
  public.mask_name(text),
  public.is_open(),
  public.level_cum_points(int),
  public.level_from_points(int),
  public.rank_from_level(int),
  public.tier_from_rank(int),
  public.board_stats()
  to anon, authenticated;

-- 로그인 사용자
grant execute on function
  public.is_staff(),
  public.is_admin(),
  public.expire_stale(),
  public.start_game_session(public.game_id),
  public.submit_game_session(uuid, int, jsonb),
  public.issue_redeem_code(int),
  public.booth_lookup_code(text),      -- 내부에서 is_staff() 검사
  public.booth_draw(text),             -- 내부에서 is_staff() 검사
  public.booth_mark_claimed(uuid),     -- 내부에서 is_staff() 검사
  public.admin_verify_user(uuid),      -- 내부에서 is_staff() 검사
  public.admin_delete_user(uuid),      -- 내부에서 is_admin() 검사
  public.admin_set_role(uuid, public.user_role),
  public.admin_set_force_open(text),
  public.admin_set_stock(int, int)
  to authenticated;


-- ===== 10. Realtime =================================================
-- /board 는 board_events 만, /pending 은 profiles 본인 행 UPDATE 만 구독한다.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'board_events'
    ) then
      alter publication supabase_realtime add table public.board_events;
    end if;

    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
    ) then
      alter publication supabase_realtime add table public.profiles;
    end if;
  end if;
end $$;

-- pg_cron 이 있으면 1분마다 만료 정리 (없으면 RPC 끝에서 lazy 처리)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('owlgames-expire-stale', '* * * * *', 'select public.expire_stale()');
  end if;
exception when others then
  raise notice 'pg_cron 스케줄 등록을 건너뜀: %', sqlerrm;
end $$;


-- ===== 11. 초기 데이터 ==============================================
insert into public.app_config (key, value) values
  ('open_hours',          '{"start":"09:00","end":"18:00","tz":"Asia/Seoul"}'::jsonb),
  ('force_open',          '"auto"'::jsonb),
  ('level_curve',         '{"base":30,"step":5}'::jsonb),
  ('game_k',              '{"typer":4,"flight":3,"phish":10}'::jsonb),
  -- typer.min_sec 은 스펙 §10.2 의 55 대신 10 으로 둔다:
  -- 방화벽 게이지 100% 시 조기 종료가 정상 플레이인데 55초 하한이면 rejected 되기 때문.
  ('game_limits',         '{"typer":{"min_sec":10,"max_sec":65},"flight":{"min_sec":3,"max_sec":185},"phish":{"min_sec":20,"max_sec":95}}'::jsonb),
  ('gacha_table',         '{"1":[0.01,0.5,3,10,20],"2":[0.02,0.8,4,12,23],"3":[0.03,1.2,5,14,26],"4":[0.05,1.6,6.5,16,28],"5":[0.08,2.2,8,18,30],"6":[0.10,3.0,10,20,32]}'::jsonb),
  ('booth_location',      '{"building":"(미정) 건물","floor":"1층","spot":"S.OWL 부스","map_url":null,"note":"부스 위치는 행사 전 공지됩니다"}'::jsonb),
  ('student_id_pattern',  '"^[0-9]{9}$"'::jsonb),
  ('redeem_code_ttl_min', '10'::jsonb)
on conflict (key) do nothing;

insert into public.prizes (place, name, stock) values
  (1, '게이밍 PC',   1),
  (2, '게이밍 마우스', 5),
  (3, '장패드',     20),
  (4, '과자',      100),
  (5, '젤리',      200)
on conflict (place) do nothing;

-- 첫 관리자 지정은 수동으로:
--   update public.profiles set role = 'admin', verified = true where student_id = '202312345';
