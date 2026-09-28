-- 공통 일시정지 1분 (DECISIONS §5-40)
-- ===================================================================
-- 게임 4종 모두 한 판에 일시정지를 60초까지 쓸 수 있다(games/core/pause.tsx 의 PAUSE_TOTAL_SEC).
-- 멈춘 시간도 서버 경과 시간(now() - started_at)에는 들어가므로, 한 판 상한(game_limits.max_sec)을
-- 60초씩 늘린다 — 안 그러면 아울러닝(게임 안 상한 540초)을 끝까지 달린 뒤 일시정지를 다 쓴 판이
-- "플레이 시간이 초과됐어요"로 거부된다. 시간 포인트는 security_play_sec(진행으로 증명되는 시간)이
-- 따로 자르므로 멈춘 시간이 포인트가 되지는 않는다.
-- ===================================================================

update public.app_config
   set value = value
     || jsonb_build_object('flight',  coalesce(value -> 'flight',  '{}'::jsonb) || '{"max_sec":660}'::jsonb)
     || jsonb_build_object('survive', coalesce(value -> 'survive', '{}'::jsonb) || '{"max_sec":2460}'::jsonb)
     || jsonb_build_object('owlis',   coalesce(value -> 'owlis',   '{}'::jsonb) || '{"max_sec":1860}'::jsonb)
     || jsonb_build_object('chef',    coalesce(value -> 'chef',    '{}'::jsonb) || '{"max_sec":1270}'::jsonb)
 where key = 'game_limits';
