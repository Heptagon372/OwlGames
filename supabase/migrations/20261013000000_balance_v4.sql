-- =====================================================================
-- OWL GAMES — 밸런스 v4 + 가입 자동 승인 (DECISIONS §5-39)
--
--   1) 아울러닝 체력 ↑ — 최대 에너지 S 110 · M 140 · L 180 → S 150 · M 190 · L 240.
--      flight_raw 의 energy_left 상한 180 → 240 (games/flight/config.ts CFG.energy.maxBySize 와 짝).
--   2) 아울러닝 분당 포인트 15 → 22 (game_points.per_min.flight).
--   3) 아울러닝 한 판 상한 185 → 600초 (game_limits.flight.max_sec).
--      체력이 늘어 긴 판이 나오는데, 예전 상한이면 185초를 넘긴 판이 통째로 "플레이 시간 초과"로 거부된다.
--      클라이언트는 540초(CFG.platform.maxSessionSec)에서 먼저 끝낸다.
--   4) 가입 자동 승인 — app_config.auto_approve(boolean, 기본 false).
--      켜져 있으면 handle_new_user 가 새 가입자를 바로 verified 로 만든다.
--      관리자 → 가입 승인 탭의 스위치가 admin_set_auto_approve 를 부르고, 켤 때 지금 대기 중인 사람도 한 번에 승인한다.
-- =====================================================================

-- ===== 1. 아울러닝 원점수 (20261003_owlrunning_v2 본문 + 에너지 상한 240) =====
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
  -- 콤보 배율 1.0~2.5 · 최대 에너지는 L 크기의 240 (밸런스 v4, 2.0 은 180 · 1.x 는 130)
  v_mult    numeric := least(2.5, greatest(1.0, coalesce(public.meta_num(p_meta, 'combo_mult_avg'), 1.0)));
  v_energy  numeric := least(240, greatest(0, coalesce(public.meta_num(p_meta, 'energy_left'), 0)));
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

revoke execute on function public.flight_raw(jsonb) from public, anon, authenticated;

-- ===== 2·3. 분당 포인트 · 한 판 상한 ====================================
update public.app_config
   set value = jsonb_set(value, '{per_min,flight}', to_jsonb(22), true)
 where key = 'game_points';

update public.app_config
   set value = jsonb_set(value, '{flight}', '{"min_sec":3,"max_sec":600}'::jsonb, true)
 where key = 'game_limits';

-- ===== 4. 가입 자동 승인 ==============================================
insert into public.app_config (key, value)
values ('auto_approve', 'false'::jsonb)
on conflict (key) do nothing;

-- 4.1 새 가입자 (20260927_admin_system 본문 + auto_approve)
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
  v_auto      boolean := coalesce((public.cfg('auto_approve') #>> '{}')::boolean, false);
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

  insert into public.profiles (id, name, student_id, verified) values (new.id, v_name, v_sid, v_auto);

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

-- 4.2 스위치 (admin) — 켜면 지금 대기 중인 사람도 한 번에 승인하고, 그 수를 돌려준다
create or replace function public.admin_set_auto_approve(p_on boolean)
returns int
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_n int := 0;
begin
  if not public.is_admin() then
    raise exception '관리자 권한이 필요해요' using errcode = 'P0001';
  end if;
  if p_on is null then
    raise exception '값이 비어 있어요' using errcode = 'P0001';
  end if;

  insert into public.app_config (key, value)
  values ('auto_approve', to_jsonb(p_on))
  on conflict (key) do update set value = excluded.value;

  if p_on then
    update public.profiles set verified = true where verified = false;
    get diagnostics v_n = row_count;
  end if;
  return v_n;
end;
$$;

comment on function public.admin_set_auto_approve(boolean)
  is '가입 자동 승인 켜기/끄기 (admin). 켤 때 대기 중인 가입자도 승인하고 그 수를 돌려준다.';

revoke execute on function public.admin_set_auto_approve(boolean) from public, anon, authenticated;
grant execute on function public.admin_set_auto_approve(boolean) to authenticated;
