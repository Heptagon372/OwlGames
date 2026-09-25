# 아울게임즈 (OWL GAMES)

S.OWL 부스 행사용 웹 미니게임 플랫폼. 플랫폼 설계는 [`OWLGAMES_SPEC.md`](OWLGAMES_SPEC.md),
게임 설계는 [`OWLRUNNING_GDD.md`](OWLRUNNING_GDD.md)(=`flight`) ·
[`OWLLOGIC_GDD.md`](OWLLOGIC_GDD.md)(=`logic`) · [`OWLSURVIVORS_GDD.md`](OWLSURVIVORS_GDD.md)(=`survive`) ·
[`OWLSPACE_GDD.md`](OWLSPACE_GDD.md)(=`space`)가 원본이고,
명세에 없어서 판단한 것들은 [`DECISIONS.md`](DECISIONS.md)에 기록한다. **새 결정은 반드시 DECISIONS.md에 추가할 것.**

## 스택 / 실행

- Next.js 15 App Router + TypeScript + Tailwind CSS v4 + Supabase(Auth/Postgres/Realtime) + next-intl(ko/en)
- `npm run dev` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run build`
- `.env.local`이 없으면 **데모 모드**(`lib/env.ts`의 `isDemo`)로 동작한다. 새 화면을 만들 때도
  Supabase 없이 렌더되게 유지할 것 — 조회는 `lib/queries.ts`(서버)·`lib/client-queries.ts`(클라이언트)에
  데모 폴백을 함께 넣는다.

## 아키텍처 원칙

- **포인트·레벨·랭크·티켓·추첨·아울 에너지는 전부 서버(Postgres RPC, `security definer`)에서 계산한다.**
  클라이언트는 `lib/rpc.ts` 래퍼로만 호출하고, 결과를 표시만 한다.
- `lib/rank.ts`는 DB 함수(`level_from_points` 등)와 **같은 수식**이어야 한다. 바꾸면 양쪽 + `tests/rank.test.ts`를 함께 고친다.
- 게임은 Canvas 2D + rAF 직접 구현(엔진 금지). 공통 루프·캔버스 헬퍼는 `games/core/`.
  피싱 헌터(카드)·아울 로직(회로 SVG + 진리표)만 한글 가독성·접근성 때문에 DOM/SVG로 그린다.
- **모든 게임은 `lib/stages.ts`의 공통 15단계를 쓴다.** 점수는 무한히 쌓이되 난이도는 단계마다
  `1.16`배씩 **곱**으로 붙고 15단계에서 고정된다. 게임은 자기 진행도를 0~1로 바꿔 `stageFromRatio`에 넘기고,
  HUD·결과에 `STAGE n/15`를 띄운다. 단계 배율을 **점수에 곱하려면 서버 재계산식도 같이** 고쳐야 한다.
- **아울 서바이버즈(`games/survive/`, v2)는 한 스테이지 = 한 런**이다. 보스를 잡아야 다음 스테이지가 열린다
  (`profiles.meta.survive_stage`). SoA 타입배열 풀 + 공간 해시를 쓰고 런 중에는 절대 `new` 하지 않는다
  (풀 크기는 `config.ts`의 `CFG.perf`). 스킬 50종은 **데이터(`data/skills.ts`) + 유형별 핸들러(`engine/skills.ts`)**,
  보스 15종은 **패턴 12종의 조합(`data/stages.ts`)**이다. 헤드리스 봇 테스트는 `tests/survive-engine.test.ts`.
- **아울스페이스(`games/space/`)는 세로 고정 540×960 탄막 슈팅**이다. 보스 패턴은 전부
  `data/patterns.ts` 의 **DSL 데이터**이고 `engine/emitter.ts` 가 실행한다 — 패턴을 코드로 쓰지 말 것.
  각도 규약은 **0도 = 아래쪽**. 충돌은 판정점 1개 vs 탄 900발이라 거리 제곱 비교만 쓴다(그리드 금지).
  **내 탄(가늘고 긴 사이안)과 적 탄(둥근 구체 + 외곽선)은 절대 같아 보이면 안 된다** — 색은 `theme.ts` 에서만.
- 서바이버즈는 **가로 고정 960×540**이고 테마(다크 네온 / 라이트)를 진입 시 고른다. 라이트에서는 발광 대신
  외곽선으로 그린다 — 렌더에서 색을 직접 쓰지 말고 `theme.ts`의 `neon()`/`outline()`을 거칠 것.
- **아울 로직(`games/logic/`)은 엔진(`engine/`)과 SVG UI(`ui/`)가 분리**돼 있다. 문제는 절차적으로 생성하고
  솔버가 유일해·최소 게이트 수를 검증한다 (`tests/logic-sim.test.ts`가 1만 문제를 돌린다).
- **아울러닝(`games/flight/`)은 고정 타임스텝(1/60) + 청크 기반 레벨**이다. 로직(`engine/`)과 렌더(`engine/render.ts`),
  HUD(DOM, `hud/`)를 분리해 두었고, 같은 물리 함수를 청크 검증기(`chunks/verify.ts`)와 봇(`engine/bot.ts`)이 공유한다.
  레벨을 추가하면 `npm run verify:chunks`가 S·M·L 모두에게 통과 경로가 있는지 확인한다.
- 모바일 우선. 버튼 최소 터치 영역 44px(`components/ui/Button.tsx`의 size 토큰이 보장).
- **플레이어가 보는 문구는 코드에 직접 쓰지 말고 `messages/ko.json`·`messages/en.json`에 넣는다**
  (서버는 `getTranslations`, 클라이언트는 `useTranslations`). 관리자·부스·전광판은 한국어 그대로 둔다.
- 화면 크기(`--ui-scale`)·소리·테마는 `/settings`에서 바꾸고 기기에만 저장된다 (`lib/prefs.ts`·`lib/theme.ts`).
  효과음은 파일 없이 WebAudio로 합성한다 (`lib/sound.ts`) — 새 소리를 넣으려면 `PATTERNS`에 음만 적으면 된다.
- 플랫폼 UI는 이미지 에셋 없이 SVG·도형으로 그린다 (`components/brand/OwlMark.tsx`, `RankBadge.tsx`, `GachaMachine.tsx`).
- **아울러닝만 외부 CC0 에셋을 쓴다** — `games/flight/engine/assets.ts`가 `public/assets/`의 Kenney 텍스처를
  로드해 틴팅/패턴으로 캔버스에 얹는다. 로딩 전에는 항상 도형 폴백으로 그려야 한다(에셋 없이도 게임이 돈다).
  새 에셋을 추가하면 `public/assets/CREDITS.md`에 출처·커밋·라이선스를 반드시 적을 것.

## 디자인 시스템 (§13)

- **리퀴드 글래스**다 (DECISIONS §5-10). 어두운 네이비 위에 반투명 유리판을 띄우고, 테두리는 1px
  시안→바이올렛→마젠타 헤어라인, 강조는 바깥 글로우로 준다.
- **다크/라이트는 `<html data-theme>` 하나로 갈린다** (§5-11). `@theme` 값이 다크 기본값이고
  `:root[data-theme="light"]`가 **같은 토큰의 값만** 덮어쓴다 — 화면 코드는 한 벌이면 된다.
  색이 아닌 표면 값(유리·배경·그레인)은 `--surface-*`/`--sky-*`/`--grain-*`를 쓴다.
- 토큰은 `app/globals.css`의 `@theme`: `night`(배경 #070b18) · `panel`(#101832) · **`neon`(바이올렛 #a78bfa, 주 강조색)** ·
  `aqua`(#22d3ee) · `magenta`(#e879f9) · **`amber`(#ffb020 — 부엉이·아울 에너지·티켓 전용)** ·
  `alert` · `ok` · `ink` / `mute` / `dim`, 반경 `rounded-card`(22px) · `rounded-tile`(16px).
- 유틸: `.card`·`.glass`(유리판) / `.card-neon`(발광 타일 — 게임 카드처럼 **눈이 먼저 가야 하는 곳만**) /
  `.card-solid`(불투명, 모달) / `.grad-line`(그라데이션 헤어라인) / `.glow-iris`·`.glow-aqua`(바깥 글로우) /
  `.grad-text`·`.grad-fill`(그라데이션 글자·채움) / `.display`(큰 제목) / `.input-glass`(입력칸) /
  `.num`(JetBrains Mono + tabular-nums) · `.text-glow` · `.hex`.
- 버튼은 `primary`=`grad-fill`+글로우, `outline`=`grad-line`+유리. 강조 카드는 `<Card glow>`.
- 배경은 `body`에 깔리는 `.night-sky`(성운 블룸 + **별밭** + 대각선 광선) + `.sky-day`(라이트용 낮 하늘) +
  `.scanlines`(필름 그레인). 페이지에서 따로 배경을 칠하지 말 것 (§5-12).
- 폰트: 한글 Pretendard(`next/font/local`, `node_modules/pretendard`), 숫자·코드 JetBrains Mono(`next/font/google`).
  **canvas에서는 CSS 변수를 못 쓰므로 `games/core/canvas.ts`의 `font(weight, size)`를 사용한다.**
- 랭크 뱃지는 17종 모두 `lib/rank.ts`의 `RANKS` 색/효과 테이블에서 나온다 (신화=무지개, 초월자=발광, 챌린저=앰버 발광+파티클).

## 자주 건드리는 곳

| 하고 싶은 일 | 파일 |
|---|---|
| 레벨 곡선·랭크 구간 | `lib/rank.ts` + `supabase/migrations/*.sql` + `tests/rank.test.ts` |
| 게임 밸런스(K값·제한시간) | `app_config.game_k` / `game_limits` (DB), 표시는 `lib/config.ts` |
| 아울러닝 물리·에너지·점수 튜닝 | `games/flight/config.ts`의 `CFG` 한 곳 (매직넘버 금지) |
| 아울러닝 레벨 디자인 | `games/flight/chunks/p0~p4.json` → `npm run verify:chunks`로 통과 가능성 검증 |
| 공통 15단계 곡선 | `lib/stages.ts` (`STAGE_STEP`) — 바꾸면 5게임 전부 난이도가 바뀐다 |
| 아울 로직 튜닝 | `games/logic/config.ts`의 `CFG`·`TIER_SHAPE` (문제 형태·시간·콤보·점수) |
| 아울 서바이버즈 튜닝 | `games/survive/config.ts`의 `CFG` + 적 스펙·보스는 `data/stages.ts` |
| 아울스페이스 튜닝 | `games/space/config.ts`의 `CFG` + 보스 패턴은 `data/patterns.ts` |
| 스페이스 보스 패턴 추가 | `data/patterns.ts`에 선언 → `data/stages.ts`의 `boss.phases`에 id를 넣는다 |
| 서바이버즈 스킬 추가·수정 | `games/survive/data/skills.ts` (동작은 `engine/skills.ts`의 유형 핸들러) |
| 서바이버즈 거부 기준 | `app_config.game_guards.survive` (DB) — 배포 없이 조정 가능 |
| 뽑기 확률·상품 | `app_config.gacha_table`, `prizes` 테이블 (관리자 화면에서 재고 수정) |
| 단어·피싱 카드 추가 | `data/typer-words.ts`, `data/phish-cards.ts` (형식은 `tests/data.test.ts`가 검증) |
| 부스 위치 안내 | `app_config.booth_location` |
| 아울 에너지(스태미나) | `app_config.owl_energy` (DB) · 표시 기본값은 `lib/config.ts` · 게임 내 드롭은 각 게임 `config.ts`의 `CFG.owlEnergy` (서버 조건과 같은 값이어야 한다) |
| 실시간 등수·변동 표시 | `components/RankDelta.tsx` · `components/LiveRefresh.tsx` · `games/core/useGameSession.ts`의 `position` |
| 플랫폼 색·유리 질감 | `app/globals.css`의 `@theme` + `.card`/`.grad-line` — 캔버스 쪽 복제본은 `games/core/canvas.ts`의 `COLORS`, 게임 테마는 `games/*/theme.ts` |
| 라이트 테마 색 | `app/globals.css`의 `:root[data-theme="light"]` 한 블록 |
| 화면 문구(한/영) | `messages/ko.json` · `messages/en.json` (두 파일의 키가 **같아야** 한다) |
| 설정 항목 추가 | `components/SettingsScreen.tsx` + 저장은 `lib/prefs.ts`(기기) / `lib/locale.ts`(쿠키) |
| 효과음 | `lib/sound.ts`의 `PATTERNS` (파일 없이 WebAudio 합성) |
| 관리자 화면 | `components/admin/AdminPanel.tsx` (대시보드·승인·유저·재고·설정·로그) |
| 운영 값을 화면에서 바꾸기 | `admin_set_config` 화이트리스트(`supabase/migrations/20260927000100_admin_system.sql`) + `lib/rpc.ts`의 `setConfigValue` |
| 관리자 대시보드 집계 | `admin_stats()` RPC — 항목을 늘리면 `lib/types.ts`의 `AdminStats`와 데모값도 같이 고친다 |

## 주의

- 공개 레포다. `.env*`는 커밋하지 않는다 (`SUPABASE_SERVICE_ROLE_KEY`는 서버 전용).
- staff는 RLS상 전체 `profiles`/`tickets`/`draws`를 볼 수 있으므로, "내 것"을 조회할 때는 `user_id` 필터를 꼭 건다.
- 미들웨어(`middleware.ts`)가 role·verified·운영시간을 검사하지만 **최종 판단은 항상 서버 RPC**다.
- 관리자·부원이 **남의** 계정/설정/재고를 바꾸면 `admin_audit`에 자동으로 남는다(테이블 트리거).
  새 관리 기능을 만들 때 로그를 따로 심을 필요가 없다 — 대신 본인이 본인 행을 바꾸는 경로는 기록되지 않는다.
- 마스터 관리자 학번(`app_config.master_admin`)은 **관리자가 0명일 때만** 승격시킨다. 기본값은 공개돼 있으니
  행사 전에 바꾸라고 안내할 것.
