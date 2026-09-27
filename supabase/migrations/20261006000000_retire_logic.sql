-- ===================================================================
-- OWL GAMES — 아울 로직(logic) 종료 (DECISIONS §5-25)
--
--   1) start_game_session: logic 도 시작할 수 없다 (20261004_retire_typer 버전 + 'logic')
--   2) 열려 있던 logic 세션은 expired — submit_game_session 은 active 세션만 받는다
--
-- 남기는 것: enum 값 'logic', app_config 의 logic 키(admin_set_config 의 K값 검증이 요구한다),
--            submit_game_session 의 logic 분기(새 세션이 없으니 닿지 않는다).
-- ===================================================================

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

  -- 나이트 타이퍼 · 아울 로직 · 피싱 헌터 · 아울스페이스는 종료했다 (에너지를 쓰기 전에 막는다)
  if p_game::text in ('typer', 'logic', 'phish', 'space') then
    raise exception '지금은 플레이할 수 없는 게임이에요' using errcode = 'P0001';
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

update public.game_sessions
   set status = 'expired'
 where game = 'logic' and status = 'active';
