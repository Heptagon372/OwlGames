-- ===================================================================
-- OWL GAMES — 보안 강화 (DECISIONS §5-27)
--
-- 점검 결과
--   · SQL 인젝션: 마이그레이션 어디에도 문자열을 이어 붙이는 동적 SQL(EXECUTE)이 없고,
--     클라이언트는 PostgREST/RPC 파라미터 바인딩만 쓴다 → 구조적으로 막혀 있다.
--     여기서는 입력값 자체를 한 번 더 좁힌다 (이름·학번 문자 화이트리스트).
--   · 게임 API 조작: 포인트 v2(20261007)에서 판당 상한이 없어지면서,
--     메타를 직접 만들어 보내면 점수가 사실상 무한히 오르는 구멍이 생겼다.
--       - 아울러닝: items 에 상한이 없다 → item_score 가 무한 (bonus_score 가 그걸 또 4배)
--       - 아울리스: 블록 점수 상한이 "모든 연쇄가 최대 연쇄" 라고 가정한다 → 수억 점
--     → 게임마다 "플레이 시간 대비 원점수" 상한을 서버에서 건다.
--
-- 바뀌는 것
--   1) profiles: 이름·학번 문자 검사 트리거 · 잠금 컬럼(locked_until, lock_reason)
--   2) app_config.security — 점수 상한 · 메타 크기 · 자동 잠금 · 연속 시작 간격
--   3) submit_game_session → 보안 래퍼 + submit_game_session_core(기존 본문, 직접 호출 불가)
--        · 잠긴 계정 · 비정상 메타(너무 큰 숫자·키 개수) → rejected
--        · 본문을 실행한 뒤 원점수가 상한을 넘으면 본문이 한 일을 **통째로 되돌리고** rejected
--        · rejected 가 짧은 시간에 쌓이면 자동 잠금
--   4) start_game_session → 보안 래퍼 + start_game_session_core (잠긴 계정·연타 차단, 에너지 소모 전)
--   5) admin_set_lock — 관리자가 잠그고 푼다 (admin_audit 에 남긴다)
--   6) app_config: 민감 키(master_admin·game_guards·security)는 관리자만 읽는다 ·
--      app_config/prizes 직접 쓰기 권한 회수(검증을 거치는 RPC 로만)
--   7) anon 은 공개 계산 함수만 실행 · 새 함수의 anon 기본 실행권한 회수
--
-- ⚠️ 앞으로 게임 본문을 고칠 때는 submit_game_session_core / start_game_session_core 를
--    create or replace 한다. submit_game_session 을 통째로 다시 만들면 보안 검사가 사라진다
--    (tests/security.test.ts 가 막는다).
-- ===================================================================


-- ===== 1. profiles ===================================================

alter table public.profiles
  add column if not exists locked_until timestamptz,
  add column if not exists lock_reason  text;

-- 이름 = 한글·영문으로 시작, 한글·영문·공백·가운뎃점·마침표·하이픈만, 1~20자
-- 학번 = 영문·숫자 4~20자 (학번 형식 설정 student_id_pattern 과 별개인 최후 방어선)
-- CHECK 제약 대신 트리거를 쓰는 이유: 예전 가입자 행이 규칙에 안 맞아도
-- 포인트 갱신 같은 다른 컬럼 UPDATE 가 막히지 않게 (이름·학번이 바뀔 때만 검사한다)
create or replace function public.profiles_validate()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.name       := btrim(new.name);
  new.student_id := btrim(new.student_id);
  if new.name !~ '^[가-힣A-Za-z][가-힣A-Za-z .·-]{0,19}$' then
    raise exception '이름은 한글·영문 20자 이내로 입력해주세요' using errcode = 'P0001';
  end if;
  if new.student_id !~ '^[0-9A-Za-z]{4,20}$' then
    raise exception '학번 형식이 올바르지 않아요' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.profiles_validate() from public, anon, authenticated;

drop trigger if exists profiles_validate on public.profiles;
create trigger profiles_validate
  before insert or update of name, student_id on public.profiles
  for each row execute function public.profiles_validate();


-- ===== 2. 설정 =======================================================
--   max_raw_per_min / raw_flat : 원점수 상한 = raw_flat + max_raw_per_min × (서버 경과 분)
--     헤드리스 봇 최고 기록(분당 원점수)의 3~4배 — flight 19k · chef 32k · owlis 36k (연쇄는 사람이 더 잘 짤 수 있어 4배).
--     서바이버즈는 이미 초당 처치·단계 속도로 묶여 있어 안전망으로만 둔다.
--   meta_num_max  : 메타 안의 숫자 절댓값 상한 (재계산식에 터무니없는 값이 들어가지 않게)
--   meta_keys_max : 메타 최상위 키 개수 상한
--   auto_lock     : window_min 분 안에 rejected 가 rejects 번 쌓이면 lock_min 분 잠근다 (rejects 0 = 끔)
--   min_start_gap_sec : 게임 시작 연타 간격
insert into public.app_config (key, value)
values ('security', '{
  "max_raw_per_min": {"flight": 80000, "chef": 100000, "owlis": 150000, "survive": 6000},
  "raw_flat":        {"flight": 5000,  "chef": 10000,  "owlis": 40000,  "survive": 10000},
  "meta_num_max": 1000000000,
  "meta_keys_max": 64,
  "auto_lock": {"rejects": 5, "window_min": 60, "lock_min": 60},
  "min_start_gap_sec": 2
}'::jsonb)
on conflict (key) do nothing;


-- ===== 3. 공통 헬퍼 ==================================================

-- 3.1 rejected 가 쌓였으면 자동 잠금. 잠근 시각(없으면 null)을 돌려준다.
--     관리자 해제(locked_until = 해제 시각) 이전의 rejected 는 세지 않는다.
create or replace function public.security_after_reject(p_uid uuid)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg    jsonb   := coalesce(public.cfg('security') -> 'auto_lock', '{}'::jsonb);
  v_th     int     := coalesce((v_cfg ->> 'rejects')::int, 5);
  v_win    int     := coalesce((v_cfg ->> 'window_min')::int, 60);
  v_lock   int     := coalesce((v_cfg ->> 'lock_min')::int, 60);
  v_p      public.profiles%rowtype;
  v_n      int;
  v_until  timestamptz;
begin
  if v_th <= 0 then
    return null;
  end if;

  select * into v_p from public.profiles where id = p_uid for update;
  -- 관리자는 테스트하다 거부될 수 있고, 잠기면 스스로 못 푼다
  if not found or v_p.role = 'admin' then
    return null;
  end if;

  select count(*) into v_n
    from public.game_sessions
   where user_id = p_uid and status = 'rejected'
     and submitted_at > greatest(now() - make_interval(mins => v_win), coalesce(v_p.locked_until, '-infinity'::timestamptz));

  if v_n >= v_th then
    v_until := now() + make_interval(mins => v_lock);
    update public.profiles
       set locked_until = v_until,
           lock_reason  = '자동 잠금: ' || v_win || '분 안에 비정상 제출 ' || v_n || '회'
     where id = p_uid;
    perform public.audit_write('user.autolock', p_uid, v_p.name,
             jsonb_build_object('rejects', v_n, 'until', v_until));
  end if;
  return v_until;
end;
$$;

-- 3.2 세션을 rejected 로 닫고 submit 응답과 같은 모양을 돌려준다 (보안 래퍼 전용)
create or replace function public.security_reject(
  p_session uuid,
  p_raw     int,
  p_meta    jsonb,
  p_reason  text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_s     public.game_sessions%rowtype;
  v_p     public.profiles%rowtype;
  v_meta  jsonb := p_meta;
  v_until timestamptz;
begin
  select * into v_s from public.game_sessions where id = p_session for update;

  if v_meta is null or jsonb_typeof(v_meta) <> 'object' or octet_length(v_meta::text) > 8192 then
    v_meta := jsonb_build_object('meta_dropped', 'invalid');
  end if;

  update public.game_sessions
     set status       = 'rejected',
         submitted_at = now(),
         raw_score    = p_raw,
         points       = 0,
         meta         = v_meta || jsonb_build_object(
                          'elapsed_sec',   round(extract(epoch from (now() - v_s.started_at))::numeric, 2),
                          'reject_reason', p_reason,
                          'reject_by',     'security')
   where id = p_session;

  perform public.owl_energy_sync(v_s.user_id);
  v_until := public.security_after_reject(v_s.user_id);
  select * into v_p from public.profiles where id = v_s.user_id;

  perform public.expire_stale();
  return jsonb_build_object(
    'status',            'rejected',
    'reason',            p_reason,
    'raw_score',         p_raw,
    'points',            0,
    'total_points',      v_p.total_points,
    'level_before',      v_p.level,
    'level_after',       v_p.level,
    'rank_before',       v_p.rank_idx,
    'rank_after',        v_p.rank_idx,
    'tickets_gained',    0,
    'owl_energy_gained', 0,
    'owl_energy',        v_p.owl_energy,
    'unlocked_stage',    coalesce((v_p.meta ->> 'survive_stage')::int, 0),
    'locked_until',      v_until
  );
end;
$$;

revoke execute on function public.security_after_reject(uuid) from public, anon, authenticated;
revoke execute on function public.security_reject(uuid, int, jsonb, text) from public, anon, authenticated;


-- ===== 4. submit_game_session → 보안 래퍼 ============================

alter function public.submit_game_session(uuid, int, jsonb) rename to submit_game_session_core;
-- 이름을 바꿔도 권한은 따라온다 — 본문을 직접 부르면 래퍼 검사를 건너뛰므로 반드시 회수한다
revoke execute on function public.submit_game_session_core(uuid, int, jsonb) from public, anon, authenticated;

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
  v_uid     uuid  := auth.uid();
  v_sec     jsonb := coalesce(public.cfg('security'), '{}'::jsonb);
  v_meta    jsonb := coalesce(p_meta, '{}'::jsonb);
  v_s       public.game_sessions%rowtype;
  v_until   timestamptz;
  v_reason  text;
  v_res     jsonb;
  v_raw     numeric;
  v_rate    numeric;
  v_flat    numeric;
  v_cap     numeric;
  v_num_max numeric := coalesce((v_sec ->> 'meta_num_max')::numeric, 1000000000);
  v_key_max int     := coalesce((v_sec ->> 'meta_keys_max')::int, 64);
begin
  if v_uid is null then
    raise exception '로그인이 필요해요' using errcode = 'P0001';
  end if;

  select * into v_s from public.game_sessions where id = p_session_id for update;
  if not found or v_s.user_id <> v_uid or v_s.status <> 'active' then
    raise exception '유효하지 않은 게임 세션이에요' using errcode = 'P0001';
  end if;

  -- ---- 본문 전에 거르는 것 ----------------------------------------
  select locked_until into v_until from public.profiles where id = v_uid;
  if v_until is not null and v_until > now() then
    v_reason := '계정이 잠겨 있어요';
  elsif jsonb_typeof(v_meta) = 'object' then
    if (select count(*) from jsonb_object_keys(v_meta)) > v_key_max then
      v_reason := '기록 값이 올바르지 않아요';
    -- 메타 안의 모든 숫자(중첩 배열·객체 포함)가 ±meta_num_max 안이어야 한다
    elsif jsonb_path_exists(v_meta,
            'lax $.** ? (@.type() == "number" && (@ > $m || @ < -$m))',
            jsonb_build_object('m', v_num_max)) then
      v_reason := '기록 값이 올바르지 않아요';
    end if;
  end if;

  if v_reason is not null then
    return public.security_reject(v_s.id, p_raw_score, v_meta, v_reason);
  end if;

  -- ---- 본문 + 원점수 상한 --------------------------------------------
  --   상한을 넘으면 예외로 이 블록(서브트랜잭션)을 되돌린다 → 본문이 올린 포인트·레벨·티켓·
  --   전광판·에너지 드롭이 전부 없던 일이 되고, 세션은 다시 active 인 상태에서 rejected 로 닫는다.
  begin
    v_res := public.submit_game_session_core(p_session_id, p_raw_score, p_meta);

    if v_res ->> 'status' = 'ok' then
      v_rate := (v_sec -> 'max_raw_per_min' ->> (v_s.game::text))::numeric;
      v_flat := coalesce((v_sec -> 'raw_flat' ->> (v_s.game::text))::numeric, 0);
      v_raw  := (v_res ->> 'raw_score')::numeric;
      if v_rate is not null then
        v_cap := v_flat + v_rate * greatest(extract(epoch from (now() - v_s.started_at)), 0) / 60.0;
        if v_raw > v_cap then
          raise exception 'raw cap' using errcode = 'OWL01';
        end if;
      end if;
    end if;
  exception when sqlstate 'OWL01' then
    return public.security_reject(
      v_s.id, p_raw_score,
      (case when jsonb_typeof(v_meta) = 'object' then v_meta else jsonb_build_object('client_meta', v_meta) end)
        || jsonb_build_object('raw_server', v_raw, 'raw_cap', round(v_cap)),
      '점수가 플레이 시간에 비해 비정상적이에요');
  end;

  -- 본문이 거부했으면 자동 잠금을 센다
  if v_res ->> 'status' = 'rejected' then
    v_until := public.security_after_reject(v_uid);
    v_res := v_res || jsonb_build_object('locked_until', v_until);
  end if;

  return v_res;
end;
$$;

revoke execute on function public.submit_game_session(uuid, int, jsonb) from public, anon, authenticated;
grant execute on function public.submit_game_session(uuid, int, jsonb) to authenticated;


-- ===== 5. start_game_session → 보안 래퍼 =============================

alter function public.start_game_session(public.game_id) rename to start_game_session_core;
revoke execute on function public.start_game_session_core(public.game_id) from public, anon, authenticated;

create or replace function public.start_game_session(p_game public.game_id)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_until timestamptz;
  v_last  timestamptz;
  v_gap   numeric := coalesce((public.cfg('security') ->> 'min_start_gap_sec')::numeric, 2);
  v_tz    text    := coalesce(public.cfg('open_hours') ->> 'tz', 'Asia/Seoul');
begin
  if v_uid is null then
    raise exception '로그인이 필요해요' using errcode = 'P0001';
  end if;

  -- 에너지를 쓰기 전에 막는다
  select locked_until into v_until from public.profiles where id = v_uid;
  if v_until is not null and v_until > now() then
    raise exception '비정상 기록이 반복돼 %까지 플레이가 잠겼어요. S.OWL 부스에 문의해주세요',
      to_char(v_until at time zone v_tz, 'HH24:MI') using errcode = 'P0001';
  end if;

  select max(started_at) into v_last from public.game_sessions where user_id = v_uid;
  if v_last is not null and extract(epoch from (now() - v_last)) < v_gap then
    raise exception '잠시 후 다시 시작해주세요' using errcode = 'P0001';
  end if;

  return public.start_game_session_core(p_game);
end;
$$;

revoke execute on function public.start_game_session(public.game_id) from public, anon, authenticated;
grant execute on function public.start_game_session(public.game_id) to authenticated;

create index if not exists game_sessions_user_started_idx on public.game_sessions (user_id, started_at desc);
create index if not exists game_sessions_rejected_idx
  on public.game_sessions (user_id, submitted_at) where status = 'rejected';


-- ===== 6. 관리자 잠금/해제 ===========================================
--   p_minutes > 0 이면 그만큼 잠그고, 0 이면 푼다(locked_until = 지금 → 그 전 rejected 는 다시 세지 않는다).
create or replace function public.admin_set_lock(p_user_id uuid, p_minutes int, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_name  text;
  v_until timestamptz;
begin
  if not public.is_admin() then
    raise exception '권한이 없어요' using errcode = 'P0001';
  end if;
  if p_user_id = auth.uid() then
    raise exception '본인 계정은 잠글 수 없어요' using errcode = 'P0001';
  end if;
  if p_minutes is null or p_minutes < 0 or p_minutes > 60 * 24 * 30 then
    raise exception '잠금 시간은 0~43200분이어야 해요' using errcode = 'P0001';
  end if;

  select name into v_name from public.profiles where id = p_user_id for update;
  if not found then
    raise exception '사용자를 찾을 수 없어요' using errcode = 'P0001';
  end if;

  v_until := now() + make_interval(mins => p_minutes);
  update public.profiles
     set locked_until = v_until,
         lock_reason  = case when p_minutes > 0 then left(coalesce(nullif(btrim(p_reason), ''), '관리자 잠금'), 100) end
   where id = p_user_id;

  -- 경기 중이던 세션도 닫는다 (잠근 뒤 제출해도 점수를 못 받게)
  if p_minutes > 0 then
    update public.game_sessions set status = 'expired' where user_id = p_user_id and status = 'active';
  end if;

  perform public.audit_write(case when p_minutes > 0 then 'user.lock' else 'user.unlock' end,
           p_user_id, v_name, jsonb_build_object('minutes', p_minutes, 'reason', p_reason));
  return jsonb_build_object('status', 'ok', 'locked_until', case when p_minutes > 0 then v_until end);
end;
$$;

revoke execute on function public.admin_set_lock(uuid, int, text) from public, anon, authenticated;
grant execute on function public.admin_set_lock(uuid, int, text) to authenticated;


-- ===== 7. app_config / prizes 권한 ====================================

-- 7.1 민감 키는 관리자만 읽는다. master_admin(학번)·game_guards/security(거부 기준 — 알면 기준에
--     딱 맞춰 조작할 수 있다). anon 에는 is_admin 실행권한이 없으므로 정책을 둘로 나눈다.
drop policy if exists app_config_select on public.app_config;
drop policy if exists app_config_select_anon on public.app_config;
drop policy if exists app_config_select_auth on public.app_config;

create policy app_config_select_anon on public.app_config
  for select to anon
  using (key <> all (array['master_admin', 'game_guards', 'security']));

create policy app_config_select_auth on public.app_config
  for select to authenticated
  using (key <> all (array['master_admin', 'game_guards', 'security']) or (select public.is_admin()));

-- 7.2 직접 쓰기 금지 — 값 검사를 하는 admin_set_config / admin_set_stock 으로만 바꾼다
revoke insert, update on table public.app_config from authenticated;
revoke update on table public.prizes from authenticated;
drop policy if exists app_config_insert_admin on public.app_config;
drop policy if exists app_config_update_admin on public.app_config;
drop policy if exists prizes_update_admin on public.prizes;


-- ===== 8. 함수 실행권한 정리 ==========================================

-- 8.1 anon(로그인 안 한 요청)은 공개 계산 함수만 부를 수 있다
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname not in ('mask_name', 'is_open', 'level_cum_points', 'level_from_points',
                             'rank_from_level', 'tier_from_rank', 'board_stats')
  loop
    -- regprocedure 는 카탈로그가 만든 인용된 이름이다 (사용자 입력이 아님)
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end $$;

-- 8.2 앞으로 만드는 함수는 기본으로 anon(과 PUBLIC)이 실행 못 한다. authenticated 는 Supabase 기본 권한이 따로 남으므로
--     로그인 사용자가 부르면 안 되는 헬퍼는 지금처럼 authenticated 에서도 명시적으로 revoke 한다
do $$
begin
  alter default privileges for role postgres in schema public revoke execute on functions from public;
  alter default privileges for role postgres in schema public revoke execute on functions from anon;
exception when others then
  raise notice '기본 실행권한 회수를 건너뜀: %', sqlerrm;
end $$;
