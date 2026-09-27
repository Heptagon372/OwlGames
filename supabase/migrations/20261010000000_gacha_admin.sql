-- =====================================================================
-- OWL GAMES — 뽑기 확률표를 관리자 화면에서 바꾸기 (§5-13)
--
--   상위 상품 재고가 8개뿐이라 행사 중에 "너무 빨리 나간다" 싶으면 확률을 바로 낮출 수 있어야 한다.
--   지금까지는 SQL 편집기로만 됐다 → admin_set_config 화이트리스트에 gacha_table 을 추가한다.
--   함수 본문은 20261007000000_points_v2.sql 것을 그대로 옮기고 분기만 끼웠다.
-- =====================================================================

create or replace function public.admin_set_config(p_key text, p_value jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_num  numeric;
  v_row  jsonb;
  v_sum  numeric;
  v_len  int;
  v_max  int;
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
    -- 지금 게임 키가 하나라도 빠지면 그 게임 제출이 통째로 실패한다 (내린 게임 키는 그대로 둬도 된다)
    for v_item in select jsonb_array_elements(to_jsonb(array['flight','survive','owlis','chef'])) loop
      v_num := (p_value ->> (v_item #>> '{}'))::numeric;
      if v_num is null or v_num <= 0 or v_num > 1000 then
        raise exception 'K값은 1~1000 사이여야 해요 (%)', v_item #>> '{}' using errcode = 'P0001';
      end if;
    end loop;

  elsif p_key = 'game_points' then
    if jsonb_typeof(p_value) <> 'object' or jsonb_typeof(p_value -> 'per_min') <> 'object' then
      raise exception '포인트 설정 형식이 올바르지 않아요' using errcode = 'P0001';
    end if;
    v_num := (p_value ->> 'base')::numeric;
    if v_num is null or v_num < 0 or v_num > 10000 then
      raise exception '기본 포인트는 0~10000 사이여야 해요' using errcode = 'P0001';
    end if;
    for v_item in select jsonb_array_elements(to_jsonb(array['flight','survive','owlis','chef'])) loop
      v_num := (p_value -> 'per_min' ->> (v_item #>> '{}'))::numeric;
      if v_num is null or v_num < 0 or v_num > 10000 then
        raise exception '분당 포인트는 0~10000 사이여야 해요 (%)', v_item #>> '{}' using errcode = 'P0001';
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
    -- 화면·안내가 읽는 키는 building · floor · spot (예전 검사는 쓰지 않는 place 를 요구해서 저장이 안 됐다)
    if jsonb_typeof(p_value) <> 'object'
       or coalesce(p_value ->> 'building', '') = ''
       or coalesce(p_value ->> 'spot', '') = '' then
      raise exception '부스 건물과 위치가 필요해요' using errcode = 'P0001';
    end if;

  elsif p_key = 'redeem_code_ttl_min' then
    v_num := (p_value #>> '{}')::numeric;
    if v_num is null or v_num < 1 or v_num > 240 then
      raise exception '코드 유효시간은 1~240분이어야 해요' using errcode = 'P0001';
    end if;

  elsif p_key = 'gacha_table' then
    -- 행사 중에 상위 상품이 너무 빨리 나가면 화면에서 바로 낮출 수 있어야 한다 (§5-13)
    if jsonb_typeof(p_value) <> 'object' then
      raise exception '확률표 형식이 올바르지 않아요' using errcode = 'P0001';
    end if;
    select count(*) into v_max from public.prizes;
    v_len := null;

    for v_item in select jsonb_array_elements(to_jsonb(array['1','2','3','4','5','6'])) loop
      v_row := p_value -> (v_item #>> '{}');
      -- 티어가 하나라도 비면 그 티어 뽑기가 통째로 실패한다
      if v_row is null or jsonb_typeof(v_row) <> 'array' then
        raise exception '티어 %s 확률이 없어요', v_item #>> '{}' using errcode = 'P0001';
      end if;

      if v_len is null then
        v_len := jsonb_array_length(v_row);
        if v_len < 1 or v_len > v_max then
          raise exception '등수 개수(%s)가 상품 수(%s)와 맞지 않아요', v_len, v_max using errcode = 'P0001';
        end if;
      elsif jsonb_array_length(v_row) <> v_len then
        raise exception '티어마다 등수 개수가 달라요' using errcode = 'P0001';
      end if;

      v_sum := 0;
      for k in 1..v_len loop
        v_num := (v_row ->> (k - 1))::numeric;
        if v_num is null or v_num < 0 or v_num > 100 then
          raise exception '확률은 0~100 사이여야 해요 (T%s %s등)', v_item #>> '{}', k using errcode = 'P0001';
        end if;
        v_sum := v_sum + v_num;
      end loop;
      -- 남는 몫이 꽝이다. 100을 넘으면 꽝이 음수가 된다
      if v_sum > 100 then
        raise exception 'T%s 당첨 확률 합이 %s%% 예요 — 100%% 를 넘을 수 없어요', v_item #>> '{}', v_sum
          using errcode = 'P0001';
      end if;
    end loop;

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
