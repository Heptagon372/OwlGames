# DECISIONS

`OWLGAMES_SPEC.md`에 명시되지 않았거나, 구현하면서 명세와 다르게 간 부분을 기록한다.
(§ 번호는 설계 문서 기준. 새 결정은 아래에 계속 추가할 것)

## 1. 스택 / 프로젝트

| 결정 | 이유 |
|---|---|
| Next.js 15.5 + React 19 + Tailwind CSS **v4** (CSS-first `@theme`) | 명세의 스택 지정을 따르되 Tailwind는 현행 버전. 토큰을 `app/globals.css` 한 곳에 모을 수 있다 |
| 로비·랭킹·티켓·내기록을 route group `app/(player)/`로 묶음 | URL은 §12 그대로(`/lobby` 등)이고, 공통 셸(헤더·하단 탭바)을 한 곳에서 관리 |
| **데모 모드** (`lib/env.ts`의 `isDemo`) | Supabase 환경변수가 없으면 가짜 데이터로 전 화면이 뜬다. 디자인 리뷰·발표·CI 빌드에 DB가 필요 없다 |
| 아이콘은 `lucide-react`, 그 외 그래픽은 SVG/CSS 직접 작성 | 이미지 에셋 없이 시작하라는 §0 지침. 부엉이 마크·랭크 뱃지·뽑기 기계 모두 코드로 그린다 |
| 테스트는 vitest (`tests/`) | 레벨 곡선(Lv100 = 27,720P)·랭크 경계·데이터 파일 형식을 CI에서 검증 |

## 2. 게임 (§7)

| 결정 | 이유 |
|---|---|
| **`game_limits.typer.min_sec` = 55 → 10** | 방화벽 100%면 60초 전에 조기 종료되는데, 55초 하한이면 정상 플레이가 `rejected` 된다 |
| 콤보 구간: 연속 3회 ×1.2, 6회 ×1.5, 10회 ×2.0 | §7.1은 배율만 정하고 조건이 없었다 |
| 타이퍼 난이도 분포: 0~20초 쉬움 위주, 20~40초 보통 위주, 40초~ 어려움 위주 | "시간이 지날수록 길어진다"의 구체화 |
| 피싱 헌터만 카드 UI를 **DOM**으로 구현 (타이머는 rAF) | 한글 본문 줄바꿈·스크린리더·스와이프 제스처가 캔버스보다 안전하다. 엔진 라이브러리 금지 원칙은 지킴 |
| 피싱 카드 70장 (정상 28 : 피싱 42 = 4:6), 한 판 안에서 셔플·중복 없음. 카드를 다 쓰면 조기 종료 | §7.3 최소 60장 충족 |
| 비행: 픽셀→미터 환산 18px = 1m, 최대 속도 340px/s, 시작 전 대기 시간도 180초 상한에 포함 | 세션 상한(`max_sec` 185) 안에서 끝나게 하기 위함 |
| 게임 시작 전 3·2·1 카운트다운 | 세션은 카운트다운 전에 발급된다(제출 시 경과시간 = 카운트다운 포함) |

## 3. DB / RPC (§10)

| 결정 | 이유 |
|---|---|
| **`board_events` 테이블 추가** (kind, masked_name, rank_idx, place, prize_name) | 전광판은 비로그인 공개 화면이라 `draws`·`rank_events`를 직접 구독할 수 없다. 마스킹된 공개 이벤트만 Realtime으로 흘린다 (꽝은 송출하지 않음) |
| Realtime 퍼블리케이션에 `board_events`, `profiles` 등록 | `profiles`는 `/pending`에서 본인 승인 이벤트를 받기 위해 (RLS로 본인 행만) |
| 뷰 `leaderboard`, `game_bests` (이름 마스킹, 인증 유저만) | §10.4의 마스킹 요구. 뷰는 소유자 권한으로 돌아 `profiles` RLS를 우회한다 |
| `expire_stale()`을 RPC **끝**에서 호출 | 시작에서 부르면 다른 유저의 만료 행 잠금을 트랜잭션 끝까지 쥐고 있어 교착이 난다. 각 RPC가 만료 여부를 직접 확인하므로 동작은 동일 |
| `draws.staff_id` nullable + `on delete set null`, `draws.user_id`/`ticket_id` cascade, `tickets.redeem_code_id` set null | 부원·유저 계정을 지울 때 FK 때문에 실패하지 않도록 (§10.3 `admin_delete_user`) |
| `tickets`에 `unique(user_id, earned_rank_idx)` | "랭크 상승 1회당 1장 = 최대 16장"을 구조적으로 보장 |
| `issue_redeem_code`에 유저별 advisory lock | 두 기기에서 동시에 발급을 눌러도 코드가 하나만 남게 |
| `admin_set_role`, `admin_set_force_open`, `admin_set_stock`, `board_stats()` 추가 | 관리자 화면(§4 `/admin`)에 필요한데 §10.3 목록에는 없었다 |
| `app_config`에 `student_id_pattern`, `redeem_code_ttl_min` 추가 | §11의 학번 정규식·§8.1의 10분 만료를 설정으로 뺐다 |
| 추첨 난수는 `extensions.gen_random_bytes(6)` → [0,100) 실수 | `search_path`를 고정했기 때문에 스키마를 명시해서 호출 |

## 4. 인증 (§11)

| 결정 | 이유 |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY`가 있으면 `auth.admin.createUser(email_confirm: true)`로 가입 | `@owlgames.local`은 실제 수신이 안 되는 주소라 확인 메일 설정에 의존하지 않게. 키가 없으면 `signUp`으로 폴백(대시보드에서 Confirm email 끄기 필요) |
| 학번 중복은 ①service_role로 `profiles` 선조회 ②GoTrue 오류 문구 매칭 두 단계로 안내 | 트리거의 unique 위반이 클라이언트에는 "Database error saving new user"로 도착한다 |
| 첫 관리자는 SQL로 직접 지정 | 가입 트리거가 메타데이터 없는 대시보드 계정을 거부하므로 |
| 미들웨어에서 매 요청 `profiles(role, verified)` 조회 | 부스 행사 규모(동시 100명)에서는 캐시보다 단순함이 이득 |

## 5. 디자인 (§13)

| 결정 | 이유 |
|---|---|
| 랭크 뱃지는 육각형 + 그라데이션 + 영문 2글자, 신화=무지개(회전 hue), 초월자=백색 발광, 챌린저=앰버 발광+파티클 | §13의 색 지시를 시각 규칙으로 구체화 |
| 배경은 `body` 고정 레이어(`.night-sky` 별·달빛 + `.scanlines`) | 페이지마다 배경을 칠하지 않아도 톤이 유지된다 |
| 모바일 하단 탭바(로비·랭킹·티켓·내기록), 부스·전광판·관리자는 가로 레이아웃 | §0 모바일 우선 / 키오스크·전광판은 태블릿·TV |
| 숫자·코드는 `.num`(JetBrains Mono, tabular-nums) | 카운트다운·점수가 흔들리지 않게 |

## 6. 남은 이슈 / 튜닝 포인트

- **비행 게임 최소 시간 3초**: 일부러 바로 죽어도 30P가 들어온다(3초당 30P). 행사 중 악용이 보이면
  `app_config.game_limits.flight.min_sec`을 올리거나, 최소 포인트를 경과시간에 비례하게 바꿀 것.
- 피싱 헌터에서 일부러 오답만 내면 20초 하한(`phish.min_sec`)보다 빨리 끝날 수 있다 → 그 판은 `rejected`(0P).
- 추첨 시뮬레이션(`supabase/tests/gacha_simulation.sql`)의 ±0.5%p는 10만 회 기준 약 3σ라 정상 구현도 1% 확률로 실패한다.
- 부스 위치·상품 재고·K값은 `app_config`/`prizes`에 placeholder로 들어가 있다. 행사 전에 채울 것 (§15).
- `delete from auth.users`(계정 삭제)와 `auth.users` 트리거는 Supabase 기본 권한에 기대므로, 실제 프로젝트에
  `db push` 후 한 번 스모크 테스트할 것.
