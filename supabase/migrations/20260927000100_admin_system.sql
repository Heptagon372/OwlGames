-- ===================================================================
-- OWL GAMES — 운영(관리자) 시스템
--
-- 무엇을 하는가
--   1) admin_audit  : 관리자·부원이 남의 계정/설정/재고를 건드린 기록 (트리거로 자동 수집)
--   2) master_admin : 첫 관리자를 SQL 편집기 없이 만들 수 있는 부트스트랩 학번
--   3) admin_set_config : 운영시간·K값·아울 에너지 등을 화면에서 바꾸는 RPC (키 화이트리스트 + 값 검증)
--   4) admin_stats  : 관리자 대시보드용 집계 한 방
--
-- 설계 메모
--   · 감사 로그는 기존 RPC를 다시 만들지 않고 **테이블 트리거**로 모은다.
--     어떤 경로로 바뀌든(관리자 RPC·부스 RPC·수기 SQL) 똑같이 남고, 기존 함수를 건드리지 않아 안전하다.
--   · "본인이 본인 행을 바꾼 것"(게임 제출로 포인트·에너지가 변하는 것)은 기록하지 않는다.
--     auth.uid() 가 대상과 같으면 건너뛴다 — 안 그러면 감사 로그가 게임 로그로 가득 찬다.
--   · 모든 함수는 security definer + search_path 고정 (기존 파일과 같은 규칙).
-- ===================================================================

-- ===== 1. 감사 로그 =================================================
create table if not exists public.admin_audit (
  id          bigserial primary key,
  -- 계정이 지워져도 기록은 남긴다 (actor_name 으로 누구였는지 알 수 있다)
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_name  text,
  action      text not null,
  target_id   uuid,          -- FK 없음: 삭제된 유저의 기록도 남아야 한다
  target_name text,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists admin_audit_created_idx on public.admin_audit (created_at desc);
create index if not exists admin_audit_action_idx  on public.admin_audit (action, created_at desc);

alter table public.admin_audit enable row level security;

drop policy if exists admin_audit_select on public.admin_audit;
create policy admin_audit_select on public.admin_audit
  for select using (public.is_admin());

-- 감사 행 하나를 남긴다. 트리거에서만 부른다 (클라이언트에 실행 권한을 주지 않는다).
create or replace function public.audit_write(
  p_action      text,
  p_target      uuid,
  p_target_name text,
  p_detail      jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_name  text;
begin
  select name into v_name from public.profiles where id = v_actor;
  insert into public.admin_audit (actor_id, actor_name, action, target_id, target_name, detail)
  values (v_actor, v_name, p_action, p_target, p_target_name, coalesce(p_detail, '{}'::jsonb));
end;
$$;

revoke execute on function public.audit_write(text, uuid, text, jsonb) from public, anon, authenticated;


-- 1.1 profiles — 역할·인증·에너지 변경과 계정 삭제
create or replace function public.audit_profiles()
returns trigger
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'DELETE' then
    perform public.audit_write('user.delete', old.id, old.name,
             jsonb_build_object('student_id', old.student_id, 'total_points', old.total_points));
    return old;
  end if;

  -- 본인이 본인 행을 바꾼 것(게임 제출 등)은 운영 기록이 아니다
  if v_actor is not null and v_actor = new.id then
    return new;
  end if;

  if new.role is distinct from old.role then
    perform public.audit_write('user.role', new.id, new.name,
             jsonb_build_object('from', old.role, 'to', new.role));
  end if;

  if new.verified is distinct from old.verified then
    perform public.audit_write(case when new.verified then 'user.verify' else 'user.unverify' end,
             new.id, new.name, jsonb_build_object('student_id', new.student_id));
  end if;

  if new.owl_energy is distinct from old.owl_energy then
    perform public.audit_write('user.energy', new.id, new.name,
             jsonb_build_object('from', old.owl_energy, 'to', new.owl_energy));
  end if;

  return new;
end;
$$;

revoke execute on function public.audit_profiles() from public, anon, authenticated;

drop trigger if exists audit_profiles_update on public.profiles;
create trigger audit_profiles_update
  after update on public.profiles
  for each row execute function public.audit_profiles();

drop trigger if exists audit_profiles_delete on public.profiles;
create trigger audit_profiles_delete
  after delete on public.profiles
  for each row execute function public.audit_profiles();


-- 1.2 app_config — 운영 설정 변경
create or replace function public.audit_app_config()
returns trigger
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.value is not distinct from old.value then
    return new;
  end if;
  perform public.audit_write('config.set', null, new.key,
           jsonb_build_object(
             'key',  new.key,
             'from', case when tg_op = 'UPDATE' then old.value else null end,
             'to',   new.value
           ));
  return new;
end;
$$;

revoke execute on function public.audit_app_config() from public, anon, authenticated;

drop trigger if exists audit_app_config_write on public.app_config;
create trigger audit_app_config_write
  after insert or update on public.app_config
  for each row execute function public.audit_app_config();


-- 1.3 prizes — 재고 변경
create or replace function public.audit_prizes()
returns trigger
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if new.stock is not distinct from old.stock then
    return new;
  end if;
  perform public.audit_write('prize.stock', null, new.name,
           jsonb_build_object('place', new.place, 'from', old.stock, 'to', new.stock));
  return new;
end;
$$;

revoke execute on function public.audit_prizes() from public, anon, authenticated;

drop trigger if exists audit_prizes_update on public.prizes;
create trigger audit_prizes_update
  after update on public.prizes
  for each row execute function public.audit_prizes();


-- ===== 2. 마스터 관리자 부트스트랩 ===================================
--   student_ids 에 있는 학번으로 가입하면 자동으로 admin + 인증 완료가 된다.
--   bootstrap_only = true 면 **관리자가 한 명도 없을 때만** 동작한다 —
--   공개 레포라 학번이 노출돼도, 첫 관리자가 생긴 뒤에는 아무 효력이 없다.
--   행사 전에 /admin → 설정에서 본인 학번으로 바꾸는 것을 권장한다.
insert into public.app_config (key, value)
values ('master_admin', '{"student_ids":["999999999"],"bootstrap_only":true}'::jsonb)
on conflict (key) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name      text := btrim(new.raw_user_meta_data ->> 'name');
  v_sid       text := btrim(new.raw_user_meta_data ->> 'student_id');
  v_pattern   text := coalesce(public.cfg('student_id_pattern') #>> '{}', '^[0-9]{9}$');
  v_master    jsonb := public.cfg('master_admin');
  v_only      boolean;
  v_has_admin boolean;
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

  -- 마스터 관리자 (설정에 등록된 학번)
  if v_master is not null
     and jsonb_typeof(v_master -> 'student_ids') = 'array'
     and (v_master -> 'student_ids') ? v_sid then
    v_only := coalesce((v_master ->> 'bootstrap_only')::boolean, true);
    select exists (select 1 from public.profiles where role = 'admin') into v_has_admin;

    if not v_only or not v_has_admin then
      update public.profiles
         set role = 'admin', verified = true
       where id = new.id;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ===== 3. 운영 설정 변경 RPC =========================================
--   화면에서 바꿀 수 있는 키만 화이트리스트로 열어 두고, 값의 모양을 검사한다.
--   (app_config 에는 admin RLS 로 직접 update 도 가능하지만, 그 경로는 검증이 없다)
create or replace function public.admin_set_config(p_key text, p_value jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_num  numeric;
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
    -- 기존 게임 키가 하나라도 빠지면 그 게임 제출이 통째로 실패한다
    for v_item in select jsonb_array_elements(to_jsonb(array['typer','flight','phish','logic','survive'])) loop
      v_num := (p_value ->> (v_item #>> '{}'))::numeric;
      if v_num is null or v_num <= 0 or v_num > 1000 then
        raise exception 'K값은 1~1000 사이여야 해요 (%)', v_item #>> '{}' using errcode = 'P0001';
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
    if jsonb_typeof(p_value) <> 'object' or coalesce(p_value ->> 'place', '') = '' then
      raise exception '부스 위치(place)가 필요해요' using errcode = 'P0001';
    end if;

  elsif p_key = 'redeem_code_ttl_min' then
    v_num := (p_value #>> '{}')::numeric;
    if v_num is null or v_num < 1 or v_num > 240 then
      raise exception '코드 유효시간은 1~240분이어야 해요' using errcode = 'P0001';
    end if;

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


-- ===== 4. 관리자 대시보드 집계 =======================================
--   행사 중에 한 화면에서 보고 싶은 것만 모은다. "오늘"은 Asia/Seoul 기준.
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz    text := coalesce(public.cfg('owl_energy') ->> 'tz', 'Asia/Seoul');
  v_day0  timestamptz;
  v_day1  timestamptz;
  v_users jsonb;
  v_today jsonb;
  v_games jsonb;
  v_tick  jsonb;
  v_prize jsonb;
begin
  if not public.is_admin() then
    raise exception '권한이 없어요' using errcode = 'P0001';
  end if;

  v_day0 := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_day1 := v_day0 + interval '1 day';

  select jsonb_build_object(
           'total',    count(*),
           'verified', count(*) filter (where verified),
           'pending',  count(*) filter (where not verified),
           'staff',    count(*) filter (where role = 'staff'),
           'admin',    count(*) filter (where role = 'admin'),
           'today',    count(*) filter (where created_at >= v_day0 and created_at < v_day1),
           'energy_avg', round(coalesce(avg(owl_energy), 0), 1)
         )
    into v_users
    from public.profiles;

  select jsonb_build_object(
           'plays',    count(*) filter (where s.status = 'submitted'),
           'rejected', count(*) filter (where s.status = 'rejected'),
           'active',   count(*) filter (where s.status = 'active'),
           'points',   coalesce(sum(s.points) filter (where s.status = 'submitted'), 0),
           'adjusted', count(*) filter (where s.status = 'submitted'
                                          and (s.meta -> 'raw_adjusted') = to_jsonb(true))
         )
    into v_today
    from public.game_sessions s
   where coalesce(s.submitted_at, s.started_at) >= v_day0
     and coalesce(s.submitted_at, s.started_at) <  v_day1;

  select coalesce(jsonb_agg(g order by g ->> 'game'), '[]'::jsonb)
    into v_games
    from (
      select jsonb_build_object(
               'game',     s.game::text,
               'plays',    count(*) filter (where s.status = 'submitted'),
               'rejected', count(*) filter (where s.status = 'rejected'),
               'avg_raw',  round(coalesce(avg(s.raw_score) filter (where s.status = 'submitted'), 0)),
               'best_raw', coalesce(max(s.raw_score) filter (where s.status = 'submitted'), 0),
               'avg_pts',  round(coalesce(avg(s.points) filter (where s.status = 'submitted'), 0))
             ) as g
        from public.game_sessions s
       where s.status in ('submitted', 'rejected')
       group by s.game
    ) q;

  select jsonb_build_object(
           'unused',   count(*) filter (where status = 'unused'),
           'reserved', count(*) filter (where status = 'reserved'),
           'used',     count(*) filter (where status = 'used')
         )
    into v_tick
    from public.tickets;

  select coalesce(jsonb_agg(jsonb_build_object(
           'place', p.place,
           'name',  p.name,
           'stock', p.stock,
           'drawn', (select count(*) from public.draws d where d.place = p.place)
         ) order by p.place), '[]'::jsonb)
    into v_prize
    from public.prizes p;

  return jsonb_build_object(
    'users',  v_users,
    'today',  coalesce(v_today, '{}'::jsonb),
    'games',  v_games,
    'tickets', v_tick,
    'prizes', v_prize,
    'energy_today', (select count(*) from public.energy_grants
                      where created_at >= v_day0 and created_at < v_day1),
    'energy_drops_today', (select count(*) from public.energy_grants
                            where staff_id is null and reason = 'game_drop'
                              and created_at >= v_day0 and created_at < v_day1),
    'draws_today', (select count(*) from public.draws
                     where drawn_at >= v_day0 and drawn_at < v_day1),
    'generated_at', now()
  );
end;
$$;

revoke execute on function public.admin_stats() from public, anon, authenticated;
grant execute on function public.admin_stats() to authenticated;
