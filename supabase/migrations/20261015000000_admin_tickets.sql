-- 관리자 티켓 지급 (DECISIONS §5-41)
-- ===================================================================
-- 관리자가 원하는 유저에게 뽑기 티켓을 직접 준다 (이벤트 보상·오류 보상 등).
--
-- 설계 메모
--   · 랭크 티켓은 여전히 "랭크당 1장"이다. 제약 tickets_one_per_rank 에 grant_seq 를 붙이고
--     랭크 티켓은 grant_seq = 0(기본값), 지급 티켓은 시퀀스 값을 받는다 — 그래서 제약 이름이 그대로라
--     submit_game_session_core 의 `on conflict on constraint tickets_one_per_rank do nothing` 을 고칠 필요가 없다.
--   · 뽑기 티어는 티켓의 earned_rank_idx 로 정해진다(§5-28). 지급 티켓은 관리자가 고른 티어의
--     **가장 낮은 랭크**를 earned_rank_idx 에 적는다 (티어만 같으면 확률이 같다).
--   · 지급 티켓이 쌓이면 16장을 넘을 수 있으므로 redeem_codes.ticket_count 상한을 99로 늘린다.
--   · 본인에게는 지급하지 못한다(§5-28 과 같은 규칙). 기록은 audit_write('ticket.grant').
-- ===================================================================

alter table public.tickets
  add column if not exists grant_seq    bigint not null default 0,
  add column if not exists granted_by   uuid references public.profiles (id) on delete set null,
  add column if not exists grant_reason text;

create sequence if not exists public.tickets_grant_seq;

alter table public.tickets drop constraint if exists tickets_one_per_rank;
alter table public.tickets
  add constraint tickets_one_per_rank unique (user_id, earned_rank_idx, grant_seq);

alter table public.redeem_codes drop constraint if exists redeem_codes_ticket_count_check;
alter table public.redeem_codes
  add constraint redeem_codes_ticket_count_check check (ticket_count between 1 and 99);


create or replace function public.admin_grant_tickets(p_user_id uuid, p_count int, p_tier int, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin  uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_name   text;
  v_rank   int;
  v_unused int;
begin
  if not public.is_admin() then
    raise exception '권한이 없어요' using errcode = 'P0001';
  end if;
  if p_user_id = v_admin then
    raise exception '본인에게는 지급할 수 없어요 (다른 관리자에게 부탁하세요)' using errcode = 'P0001';
  end if;
  if p_count is null or p_count < 1 or p_count > 10 then
    raise exception '지급 장수는 1~10장이에요' using errcode = 'P0001';
  end if;
  if v_reason = '' or char_length(v_reason) > 40 then
    raise exception '지급 사유를 적어주세요 (40자 이내)' using errcode = 'P0001';
  end if;

  -- 티어의 가장 낮은 랭크 (랭크 0 은 티켓이 없으므로 1부터)
  select min(r) into v_rank
    from generate_series(1, 16) r
   where public.tier_from_rank(r) = p_tier;
  if v_rank is null then
    raise exception '티어는 1~6이에요' using errcode = 'P0001';
  end if;

  select name into v_name from public.profiles where id = p_user_id for update;
  if not found then
    raise exception '사용자를 찾을 수 없어요' using errcode = 'P0001';
  end if;

  insert into public.tickets (user_id, earned_rank_idx, grant_seq, granted_by, grant_reason)
  select p_user_id, v_rank, nextval('public.tickets_grant_seq'), v_admin, v_reason
    from generate_series(1, p_count);

  select count(*) into v_unused
    from public.tickets where user_id = p_user_id and status = 'unused';

  perform public.audit_write('ticket.grant', p_user_id, v_name,
           jsonb_build_object('count', p_count, 'tier', p_tier, 'reason', v_reason));

  return jsonb_build_object('status', 'ok', 'granted', p_count, 'tier', p_tier, 'unused', v_unused);
end;
$$;

revoke execute on function public.admin_grant_tickets(uuid, int, int, text) from public, anon, authenticated;
grant execute on function public.admin_grant_tickets(uuid, int, int, text) to authenticated;  -- 내부에서 is_admin()
