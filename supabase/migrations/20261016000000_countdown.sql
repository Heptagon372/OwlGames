-- 행사 카운트다운 (DECISIONS §5-45)
-- ===================================================================
-- 로비 홍보 영상 밑에 "아울게임즈 종료까지" 카운트다운을 띄운다.
-- 끝나면 "수고하셨습니다" 로 바뀐다 — 게임은 계속 되고, 뽑기는 추후 공지.
--
--   app_config.countdown = { "enabled": bool, "ends_at": ISO 8601 시각(시간대 포함) }
--   기본값: 2026-09-29 18:00 (KST)
--   관리자 → 설정 탭의 카드가 admin_set_countdown 을 부른다 (값 검사 + 운영 기록은 app_config 트리거).
--   표시만 하는 값이라 게임·뽑기 RPC 는 이 값을 보지 않는다.
-- ===================================================================

insert into public.app_config (key, value)
values ('countdown', '{"enabled": true, "ends_at": "2026-09-29T18:00:00+09:00"}'::jsonb)
on conflict (key) do nothing;

create or replace function public.admin_set_countdown(p_enabled boolean, p_ends_at timestamptz)
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
  if p_enabled is null or p_ends_at is null then
    raise exception '값이 비어 있어요' using errcode = 'P0001';
  end if;
  if p_ends_at < now() - interval '365 days' or p_ends_at > now() + interval '365 days' then
    raise exception '종료 시각은 1년 안쪽이어야 해요' using errcode = 'P0001';
  end if;

  insert into public.app_config (key, value)
  values ('countdown', jsonb_build_object(
    'enabled', p_enabled,
    'ends_at', to_char(p_ends_at at time zone 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI:SS"+09:00"')
  ))
  on conflict (key) do update set value = excluded.value;
end;
$$;

comment on function public.admin_set_countdown(boolean, timestamptz)
  is '로비 카운트다운 켜기/끄기 · 종료 시각 (admin). 표시 전용.';

revoke execute on function public.admin_set_countdown(boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_set_countdown(boolean, timestamptz) to authenticated;
