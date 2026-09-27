-- ===================================================================
-- OWL GAMES — 보안 강화 2: 포인트 · 뽑기 (DECISIONS §5-28)
--
-- 20261008_security 뒤에 다시 찾은 구멍
--   1) 시간 포인트(분당 per_min)가 벽시계(now() - started_at)만 본다 → 게임을 켜 두고 방치하거나
--      일시정지한 채 max_sec 까지 기다렸다가, 거부 규칙을 통과하는 최소 메타만 보내면 시간 포인트를 다 받는다
--      (서바이버즈 40분 방치 = 50 + 480P).
--   2) 원점수 상한이 있어도 포인트는 여전히 크다 — 아울러닝 한 판 상한 ≈ 2,600P × 시작 에너지 10 ≈ 26,000P
--      → 조작 30분 만에 챌린저(27,720P · 티켓 16장 · T6) 에 거의 닿는다.
--   3) 뽑기 티어가 "뽑는 시점 랭크" 라서 티켓을 모았다가 T6 에서 몰아 뽑는 게 최선 → 조작 계정이 상위 상품을 쓸어간다.
--   4) 부원 권한: 자기 계정에 에너지를 줄 수 있다 · 남의 뽑기 코드를 전부 읽을 수 있다(RLS) · 자기 코드를 자기가 뽑을 수 있다.
--
-- 바뀌는 것
--   A) 시간 포인트는 "진행으로 증명되는 시간"까지만 — security_play_sec (메타 duration_s + 게임별 진행 한도)
--      → submit 래퍼가 트랜잭션 설정 owl.play_sec 로 넘기고 game_points 가 least() 로 쓴다
--   B) 검토 보류: 한 판 3,000P 이상 또는 1시간 5,000P 이상 → profiles.review_required.
--      포인트·티켓은 그대로지만 관리자가 확인하기 전에는 부스에서 뽑을 수 없다.
--   C) 뽑기 티어 = 티켓을 얻은 랭크의 티어 (tickets.earned_rank_idx) — 모아 뽑기 이점 없음 (스펙 §5.3 변경)
--   D) 부원: 본인 에너지 지급 금지 · 본인 코드 뽑기 금지 · redeem_codes 는 본인 것만 읽힘 · 수령 처리자 기록(claimed_by)
--   E) 잠긴 계정은 뽑기도 막는다
-- ===================================================================


-- ===== 1. 컬럼 =======================================================

alter table public.profiles
  add column if not exists review_required boolean not null default false,
  add column if not exists review_reason   text,
  add column if not exists reviewed_at     timestamptz;

alter table public.draws
  add column if not exists claimed_by uuid references public.profiles (id) on delete set null;


-- ===== 2. 설정 (security 에 새 키만 채운다 — 이미 바꾼 값은 유지) =====
--   play   : 진행 한도. 봇 실측의 약 3배 (아울러닝 최저 13.6 m/s · 레스토랑 접시당 최대 10.8초 ·
--            아울리스 블록당 최대 5.9초 — 가만히 있어도 중력으로 떨어진다 · 서바이버즈 보스 없는 단계 30초)
--   review : 0 이면 끈다
update public.app_config
   set value = jsonb_build_object(
                 'play', jsonb_build_object(
                   'slack_sec', 30,
                   'flight_min_mps', 5,
                   'chef_sec_per_plate', 30,
                   'owlis_sec_per_piece', 15,
                   'survive_sec_per_stage', 30,
                   'survive_sec_per_boss', 600),
                 'review', jsonb_build_object(
                   'session_points', 3000,
                   'hour_points', 5000)
               ) || value
 where key = 'security';


-- ===== 3. 진행으로 증명되는 플레이 시간 ================================
--   min(서버 경과, 클라이언트 duration_s + 3, 게임별 진행 한도).
--   정상 판은 한도보다 훨씬 짧다(tests/security.test.ts 가 봇 판으로 확인) — 방치·일시정지 시간만 잘린다.
--   TS 사본: lib/anticheat.ts 의 playSecBound
create or replace function public.security_play_sec(p_game text, p_meta jsonb, p_elapsed numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c       jsonb   := coalesce(public.cfg('security') -> 'play', '{}'::jsonb);
  v       numeric := greatest(coalesce(p_elapsed, 0), 0);
  v_dur   numeric := public.meta_num(p_meta, 'duration_s');
  v_slack numeric := coalesce((c ->> 'slack_sec')::numeric, 30);
  v_stage int;
begin
  if v_dur is not null then
    v := least(v, greatest(v_dur, 0) + 3);
  end if;

  if p_game = 'flight' then
    -- 부엉이는 늘 앞으로 난다 — 거리 없이 시간만 흐를 수 없다
    v := least(v, greatest(coalesce(public.meta_num(p_meta, 'distance_m'), 0), 0)
                  / coalesce((c ->> 'flight_min_mps')::numeric, 5) + v_slack);
  elsif p_game = 'chef' then
    -- 손님은 기다려 주지 않는다 (인내도 0 = 게임 오버)
    v := least(v, (greatest(coalesce(public.meta_num(p_meta, 'served_total'), 0), 0) + 1)
                  * coalesce((c ->> 'chef_sec_per_plate')::numeric, 30) + v_slack);
  elsif p_game = 'owlis' then
    -- 가만히 있어도 블록은 중력으로 굳는다
    v := least(v, (greatest(coalesce(public.meta_num(p_meta, 'pieces'), 0), 0) + 1)
                  * coalesce((c ->> 'owlis_sec_per_piece')::numeric, 15) + v_slack);
  elsif p_game = 'survive' then
    -- 보스 없는 단계는 30초마다 저절로 오른다. 보스 단계(지금 싸우는 보스 포함)는 보스당 넉넉히
    v_stage := least(greatest(1, coalesce(public.meta_num(p_meta, 'stage'), 1)), 100000)::int;
    v := least(v, v_stage * coalesce((c ->> 'survive_sec_per_stage')::numeric, 30)
                  + public.survive_bosses_before(v_stage + 1) * coalesce((c ->> 'survive_sec_per_boss')::numeric, 600)
                  + v_slack);
  end if;

  return greatest(v, 0);
end;
$$;

revoke execute on function public.security_play_sec(text, jsonb, numeric) from public, anon, authenticated;


-- ===== 4. game_points — 시간 몫은 owl.play_sec 까지만 =================
--   식은 20261007_points_v2 그대로. submit 래퍼가 트랜잭션 설정 owl.play_sec 을 걸면 그보다 긴 시간은 버린다.
--   (least 라서 이 설정은 포인트를 줄이기만 한다)
create or replace function public.game_points(p_game text, p_raw int, p_sec numeric)
returns int
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg  jsonb   := coalesce(public.cfg('game_points'), '{}'::jsonb);
  v_base numeric := coalesce((v_cfg ->> 'base')::numeric, 50);
  v_rate numeric := coalesce((v_cfg -> 'per_min' ->> p_game)::numeric, 0);
  v_k    numeric := (public.cfg('game_k') ->> p_game)::numeric;
  v_play numeric := nullif(current_setting('owl.play_sec', true), '')::numeric;
  v_sec  numeric := greatest(coalesce(p_sec, 0), 0);
  v_pts  numeric;
begin
  if v_k is null or v_k <= 0 then
    v_k := 1e9;   -- K 가 없으면 원점수 몫은 0
  end if;
  if v_play is not null then
    v_sec := least(v_sec, greatest(v_play, 0));
  end if;
  v_pts := floor(v_base)
         + floor(v_sec / 60.0 * v_rate)
         + floor(greatest(coalesce(p_raw, 0), 0)::numeric / v_k);
  return least(v_pts, 2147483647)::int;
end;
$$;

revoke execute on function public.game_points(text, int, numeric) from public, anon, authenticated;


-- ===== 5. 검토 보류 ===================================================
--   한 판 session_points 이상이거나, 지난 1시간(마지막 검토 이후) 합이 hour_points 이상이면 표시한다.
--   관리자는 제외(테스트). 부원은 제외하지 않는다 — 부원도 부스에서 뽑는다.
create or replace function public.security_review_check(p_uid uuid, p_points int)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  c        jsonb := coalesce(public.cfg('security') -> 'review', '{}'::jsonb);
  v_sess   int   := coalesce((c ->> 'session_points')::int, 3000);
  v_hour   int   := coalesce((c ->> 'hour_points')::int, 5000);
  v_p      public.profiles%rowtype;
  v_sum    bigint;
  v_reason text;
begin
  select * into v_p from public.profiles where id = p_uid for update;
  if not found or v_p.role = 'admin' then
    return false;
  end if;
  if v_p.review_required then
    return true;
  end if;

  select coalesce(sum(points), 0) into v_sum
    from public.game_sessions
   where user_id = p_uid and status = 'submitted'
     and submitted_at > greatest(now() - interval '60 minutes', coalesce(v_p.reviewed_at, '-infinity'::timestamptz));

  if v_sess > 0 and coalesce(p_points, 0) >= v_sess then
    v_reason := '한 판 ' || p_points || 'P';
  elsif v_hour > 0 and v_sum >= v_hour then
    v_reason := '1시간 ' || v_sum || 'P';
  end if;

  if v_reason is null then
    return false;
  end if;

  update public.profiles
     set review_required = true,
         review_reason   = '포인트 급상승: ' || v_reason
   where id = p_uid;
  perform public.audit_write('user.review', p_uid, v_p.name, jsonb_build_object('reason', v_reason));
  return true;
end;
$$;

revoke execute on function public.security_review_check(uuid, int) from public, anon, authenticated;


-- ===== 6. submit_game_session 래퍼 (20261008 + 플레이 시간 · 검토) =====
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
  v_elapsed numeric;
  v_play    numeric;
  v_review  boolean;
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
  v_elapsed := greatest(extract(epoch from (now() - v_s.started_at)), 0);

  -- ---- 본문 전에 거르는 것 ----------------------------------------
  select locked_until into v_until from public.profiles where id = v_uid;
  if v_until is not null and v_until > now() then
    v_reason := '계정이 잠겨 있어요';
  elsif jsonb_typeof(v_meta) = 'object' then
    if (select count(*) from jsonb_object_keys(v_meta)) > v_key_max then
      v_reason := '기록 값이 올바르지 않아요';
    elsif jsonb_path_exists(v_meta,
            'lax $.** ? (@.type() == "number" && (@ > $m || @ < -$m))',
            jsonb_build_object('m', v_num_max)) then
      v_reason := '기록 값이 올바르지 않아요';
    end if;
  end if;

  if v_reason is not null then
    return public.security_reject(v_s.id, p_raw_score, v_meta, v_reason);
  end if;

  -- ---- 시간 포인트는 진행으로 증명되는 시간까지만 (game_points 가 읽는다) ----
  v_play := public.security_play_sec(v_s.game::text,
              case when jsonb_typeof(v_meta) = 'object' then v_meta else '{}'::jsonb end, v_elapsed);
  perform set_config('owl.play_sec', v_play::text, true);

  -- ---- 본문 + 원점수 상한 (20261008 과 같다) ---------------------------
  begin
    v_res := public.submit_game_session_core(p_session_id, p_raw_score, p_meta);

    if v_res ->> 'status' = 'ok' then
      v_rate := (v_sec -> 'max_raw_per_min' ->> (v_s.game::text))::numeric;
      v_flat := coalesce((v_sec -> 'raw_flat' ->> (v_s.game::text))::numeric, 0);
      v_raw  := (v_res ->> 'raw_score')::numeric;
      if v_rate is not null then
        v_cap := v_flat + v_rate * v_elapsed / 60.0;
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

  if v_res ->> 'status' = 'rejected' then
    v_until := public.security_after_reject(v_uid);
    return v_res || jsonb_build_object('locked_until', v_until);
  end if;

  -- ---- 검토 보류 (포인트는 그대로, 뽑기만 막는다) ----------------------
  v_review := public.security_review_check(v_uid, (v_res ->> 'points')::int);
  -- 방치 시간을 잘랐으면 관리자가 볼 수 있게 남긴다
  if v_play < v_elapsed - 1 then
    update public.game_sessions
       set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('play_sec', round(v_play, 2))
     where id = v_s.id;
  end if;

  return v_res || jsonb_build_object('review_required', v_review);
end;
$$;

revoke execute on function public.submit_game_session(uuid, int, jsonb) from public, anon, authenticated;
grant execute on function public.submit_game_session(uuid, int, jsonb) to authenticated;


-- ===== 7. 부스 =======================================================

-- 7.1 코드 조회 — tier 는 "다음에 뽑을 티켓"의 티어. 검토·잠금 상태를 같이 보여준다
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
  v_next_rank int;
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

  select earned_rank_idx into v_next_rank
    from public.tickets
   where redeem_code_id = v_c.id and status = 'reserved'
   order by created_at, earned_rank_idx
   limit 1;

  perform public.expire_stale();
  return jsonb_build_object(
    'code_id',         v_c.id,
    'code',            v_c.code,
    'user_id',         v_p.id,
    'name',            v_p.name,
    'student_id',      v_p.student_id,
    'rank_idx',        v_p.rank_idx,
    'level',           v_p.level,
    'tier',            public.tier_from_rank(coalesce(v_next_rank, v_p.rank_idx)),
    'remaining',       v_remaining,
    'expires_at',      v_c.expires_at,
    'review_required', v_p.review_required,
    'review_reason',   v_p.review_reason,
    'locked',          coalesce(v_p.locked_until > now(), false),
    'own_code',        v_c.user_id = auth.uid()
  );
end;
$$;

-- 7.2 추첨 1회 — 20260923_init 본문 + 티켓 티어 · 본인 코드 금지 · 검토/잠금 차단
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
  v_earned    int;
  v_tier      int;
  v_roll      numeric;
  v_place     int;
  v_prize     text;
  v_draw_id   uuid;
  v_remaining int;
  v_next_rank int;
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

  -- 부원이 자기 티켓을 자기 손으로 뽑지 않는다 (다른 부원이 뽑아준다)
  if v_c.user_id = v_staff then
    raise exception '본인 코드는 다른 부원이 뽑아줘야 해요' using errcode = 'P0001';
  end if;

  select * into v_p from public.profiles where id = v_c.user_id;
  if v_p.review_required then
    raise exception '검토가 필요한 계정이에요 (%). 관리자가 확인한 뒤 뽑을 수 있어요',
      coalesce(v_p.review_reason, '포인트 급상승') using errcode = 'P0001';
  end if;
  if v_p.locked_until is not null and v_p.locked_until > now() then
    raise exception '잠긴 계정이라 뽑을 수 없어요' using errcode = 'P0001';
  end if;

  select id, earned_rank_idx into v_ticket_id, v_earned
    from public.tickets
   where redeem_code_id = v_c.id and status = 'reserved'
   order by created_at, earned_rank_idx
   limit 1
   for update;
  if v_ticket_id is null then
    raise exception '남은 뽑기가 없어요' using errcode = 'P0001';
  end if;

  -- 티어는 티켓을 얻은 랭크 기준 (DECISIONS §5-28) — 모아 뒀다 뽑아도 확률은 같다
  v_tier := public.tier_from_rank(v_earned);

  -- 상품 행을 place 순서로 잠근다 (재고 차감 경합 직렬화)
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

  if v_place is not null then
    insert into public.board_events (kind, masked_name, rank_idx, place, prize_name)
    values ('draw', public.mask_name(v_p.name), v_p.rank_idx, v_place, v_prize);
  end if;

  select count(*) into v_remaining
    from public.tickets where redeem_code_id = v_c.id and status = 'reserved';

  select earned_rank_idx into v_next_rank
    from public.tickets
   where redeem_code_id = v_c.id and status = 'reserved'
   order by created_at, earned_rank_idx
   limit 1;

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
    'remaining',  v_remaining,
    'next_tier',  case when v_next_rank is null then null else public.tier_from_rank(v_next_rank) end
  );
end;
$$;

-- 7.3 수령 처리 — 누가 내줬는지 남긴다
create or replace function public.booth_mark_claimed(p_draw_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_place int;
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
     set claimed    = true,
         claimed_at = coalesce(claimed_at, now()),
         claimed_by = coalesce(claimed_by, auth.uid())
   where id = p_draw_id;
end;
$$;

-- 7.4 미션 보상 에너지 — 20260925_owl_energy 본문 + 본인 지급 금지
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
  if v_p.id = v_staff then
    raise exception '본인에게는 지급할 수 없어요 (다른 부원에게 부탁하세요)' using errcode = 'P0001';
  end if;

  v_hard   := coalesce((public.cfg('owl_energy') ->> 'hard_cap')::int, 20);
  v_energy := public.owl_energy_sync(v_p.id);

  if v_energy >= v_hard then
    raise exception '이미 에너지가 가득 찼어요' using errcode = 'P0001';
  end if;

  v_new   := least(v_hard, v_energy + p_amount);
  v_added := v_new - v_energy;

  update public.profiles set owl_energy = v_new where id = v_p.id;

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

revoke execute on function public.booth_lookup_code(text) from public, anon, authenticated;
revoke execute on function public.booth_draw(text) from public, anon, authenticated;
revoke execute on function public.booth_mark_claimed(uuid) from public, anon, authenticated;
revoke execute on function public.booth_grant_energy(text, int, text) from public, anon, authenticated;
grant execute on function public.booth_lookup_code(text) to authenticated;          -- 내부에서 is_staff()
grant execute on function public.booth_draw(text) to authenticated;
grant execute on function public.booth_mark_claimed(uuid) to authenticated;
grant execute on function public.booth_grant_energy(text, int, text) to authenticated;


-- ===== 8. 관리자: 검토 완료 ============================================
create or replace function public.admin_clear_review(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_name   text;
  v_reason text;
begin
  if not public.is_admin() then
    raise exception '권한이 없어요' using errcode = 'P0001';
  end if;

  select name, review_reason into v_name, v_reason from public.profiles where id = p_user_id for update;
  if not found then
    raise exception '사용자를 찾을 수 없어요' using errcode = 'P0001';
  end if;

  -- reviewed_at 이전의 판은 다시 세지 않는다
  update public.profiles
     set review_required = false, review_reason = null, reviewed_at = now()
   where id = p_user_id;

  perform public.audit_write('user.review_clear', p_user_id, v_name, jsonb_build_object('reason', v_reason));
end;
$$;

revoke execute on function public.admin_clear_review(uuid) from public, anon, authenticated;
grant execute on function public.admin_clear_review(uuid) to authenticated;


-- ===== 9. 뽑기 코드는 본인 것만 읽는다 =================================
--   부스는 security definer RPC(booth_lookup_code · booth_draw)로만 코드를 쓴다 — 부원이 테이블을 읽을 이유가 없다.
--   (예전에는 부원이 모든 활성 코드를 읽을 수 있어서, 주인이 오기 전에 남의 코드로 뽑을 수 있었다)
drop policy if exists redeem_codes_select on public.redeem_codes;
create policy redeem_codes_select on public.redeem_codes
  for select to authenticated
  using (user_id = (select auth.uid()));
