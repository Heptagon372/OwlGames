# 아울게임즈 (OWL GAMES)

S.OWL 부스 행사용 웹 미니게임 플랫폼. 플랫폼 설계는 [`OWLGAMES_SPEC.md`](OWLGAMES_SPEC.md),
게임 설계는 [`OWLRUNNING_GDD.md`](OWLRUNNING_GDD.md)(=`flight`) ·
[`OWLSURVIVORS_GDD.md`](OWLSURVIVORS_GDD.md)(=`survive`) ·
[`OWLIS_GDD.md`](OWLIS_GDD.md)(=`owlis`) · [`OWLRESTAURANT_GDD.md`](OWLRESTAURANT_GDD.md)(=`chef`)가 원본이고,
명세에 없어서 판단한 것들은 [`DECISIONS.md`](DECISIONS.md)에 기록한다. **새 결정은 반드시 DECISIONS.md에 추가할 것.**
나이트 타이퍼(`typer`)·아울 로직(`logic`)·피싱 헌터(`phish`)·아울스페이스(`space`)는 **내린 게임**이다 (DECISIONS §5-19·§5-22·§5-25). **게임은 4종**(아울러닝·서바이버즈·아울리스·아울 레스토랑)이다 — 코드는 없고 DB enum 값과 예전 세션 행만 남아 있다.
세션 행의 `game` 을 그릴 때는 `GAMES[id]` 대신 `lib/games.ts` 의 `gameEmoji`·`gameTitleKo`·`isGameId` 를 쓴다.

## 스택 / 실행

- Next.js 15 App Router + TypeScript + Tailwind CSS v4 + Supabase(Auth/Postgres/Realtime) + next-intl(ko/en)
- `npm run dev` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run build`
- **목(데모) 데이터는 없다** (DECISIONS §5-22). 모든 화면은 Supabase 실데이터만 읽는다.
  `.env.local`이 없으면(`lib/env.ts`의 `isConfigured`=false) 조회는 빈 값(`[]`·`null`·0)을 돌려주고,
  `SetupBanner`가 미설정을 알리며, 미들웨어가 로그인 필요 화면을 로그인으로 돌린다.
  새 화면·조회에 **가짜 데이터 폴백을 넣지 말 것** — 조회 실패 시에도 빈 값으로 그린다.

## 아키텍처 원칙

- **포인트·레벨·랭크·티켓·추첨·아울 에너지는 전부 서버(Postgres RPC, `security definer`)에서 계산한다.**
  클라이언트는 `lib/rpc.ts` 래퍼로만 호출하고, 결과를 표시만 한다.
- **보안 (DECISIONS §5-27)**: `submit_game_session`·`start_game_session` 은 **보안 래퍼**이고 게임 본문은
  `submit_game_session_core`·`start_game_session_core`(클라이언트 실행 권한 없음)다. **게임 본문을 고칠 때는 `_core` 를 create or replace** 할 것 —
  래퍼를 통째로 다시 만들면 원점수 상한(`app_config.security`)·자동 잠금·메타 검사가 사라진다(`tests/security.test.ts` 가 막는다).
  새 함수는 anon 기본 실행권한이 없다 — 필요한 역할에만 `grant` 하고, 로그인 사용자가 부르면 안 되는 헬퍼는 `authenticated` 에서도 `revoke` 한다. 동적 SQL(`execute '...' || 값`) 금지.
  사용자 입력을 PostgREST **필터 문자열**(`.or(...)`)에 넣을 때는 `lib/validate.ts` 의 `safeSearchTerm` 을 거친다.
  로그인·가입 입력 규칙은 `lib/validate.ts` 와 DB 트리거 `profiles_validate` 가 같은 규칙이다.
  **시간 포인트는 "진행으로 증명되는 시간"까지만**(`security_play_sec` ↔ TS 사본 `lib/anticheat.ts`) — 게임 메타 키(`duration_s`·`distance_m`·
  `served_total`·`pieces`·`stage`)를 바꾸면 양쪽을 같이. 한 판·1시간 포인트가 크면 **뽑기만 검토 보류**(`review_required`, 관리자 → 로그에서 확인 완료).
  **뽑기 티어는 티켓을 얻은 랭크 기준**(`tickets.earned_rank_idx`)이고, 부원은 본인 코드 뽑기·본인 에너지 지급을 못 한다 (§5-28).
- `lib/rank.ts`는 DB 함수(`level_from_points` 등)와 **같은 수식**이어야 한다. 바꾸면 양쪽 + `tests/rank.test.ts`를 함께 고친다.
- 게임은 Canvas 2D + rAF 직접 구현(엔진 금지). 공통 루프·캔버스 헬퍼는 `games/core/`.
  아울 레스토랑(주문·재료 탭 화면)만 한글 가독성·접근성 때문에 DOM/SVG로 그린다.
- **모든 게임은 `lib/stages.ts`의 공통 15단계를 쓴다.** 점수는 무한히 쌓이되 난이도는 단계마다
  `1.16`배씩 **곱**으로 붙고 15단계에서 고정된다. 게임은 자기 진행도를 0~1로 바꿔 `stageFromRatio`에 넘기고,
  HUD·결과에 `STAGE n/15`를 띄운다. 단계 배율을 **점수에 곱하려면 서버 재계산식도 같이** 고쳐야 한다.
  **예외: 아울리스는 STAGE 대신 AI LEVEL(1~5, 5+ …)** 이 난이도다 (기획서가 "스테이지 없음"을 못박았다).
- **아울 서바이버즈(`games/survive/`, v3)는 스테이지 선택 없이 무한 맵 한 런에서 1 → 15 → 무한 단계**로 오른다.
  보스 없는 단계는 30초, 보스 단계(5·8·12·15, 이후 19·23·27…)는 보스를 잡아야 넘어간다 — 그래서 **도달 단계만 알면
  잡은 보스 수가 정해지고**, 서버(`survive_bosses_before`)와 `config.ts`의 `bossOf`/`bossesBefore`가 같은 규칙이어야 한다.
  SoA 타입배열 풀 + 공간 해시를 쓰고 런 중에는 절대 `new` 하지 않는다 (풀 크기는 `config.ts`의 `CFG.perf`).
  몬스터는 도형 10종(`data/stages.ts`), 장애물은 전역 격자 + 시드 해시로 카메라 주변만 흘려 깐다(`engine/obstacles.ts`).
  **보스 4종은 보스 하나 = 모듈 하나(`engine/bosses/*.ts`)**이고 경고 원·레이저·색 장판·블랙홀은 `bosses/common.ts`가 공유한다.
  **경고 없는 즉사기를 만들지 말 것.** 스킬 90종(액티브 35 · 패시브 28 · 진화 27)은 **데이터(`data/skills.ts`) + 유형별 핸들러(`engine/skills.ts`)**.
  엔진 문구는 메시지 키(`msg`, 이름은 `ref("boss.hexa")`)로 담고 HUD 가 `hud.survive.*`로 번역한다.
  헤드리스 봇 테스트는 `tests/survive-engine.test.ts`.
- **아울리스(`games/owlis/`)는 1인용 무한 퍼즐 대전**(플레이어 vs 적응형 AI)이다. 필드 6×12, 두 칸 블록, 같은 색 4개 연결·연쇄.
  보드 규칙은 순수 함수(`engine/board.ts`, 미리 만든 버퍼만), 필드 상태 기계(`engine/field.ts`)를 **플레이어와 AI 가 같이** 쓰고,
  AI 는 플레이어와 **같은 조작 함수**(`moveX`·`rotate`·`hardDrop`)만 부른다. **AI 는 공개 정보만 본다**(자기 보드·`peek` 로 NEXT 개수까지·
  받을 방해 블록·상대 위험도) — 블록 순서는 `pairAt(seed, i)` 로 상태 없이 계산한다. AI 난이도 값은 전부 `config.ts` 의 `CFG.ai` 표 →
  `engine/difficulty.ts` 의 `aiParams(D)` 한 곳에서 나온다 (코드에 난이도를 하드코딩하지 말 것). 배치는 `render.ts` 의 `layout()` 이
  화면 비율로 고른다(폰 세로·PC 가로 둘 다). 점수·거부 식은 `engine/score.ts` 의 `serverRaw`·`serverReject` 가 SQL 의 TS 사본이다.
  헤드리스 봇 테스트는 `tests/owlis-engine.test.ts`.
  **그림 파일 없이 코드로 그린다** — 캔버스는 네온(네온 테두리 부엉이 블록 · 네온관 필드 · 흐르는 격자 · 링 안의 육각 부엉이),
  메뉴·HUD 는 유리 카드 + 네온 글자 (DECISIONS §5-21).
  색·그라데이션은 `theme.ts` 의 `OWLIS`·`GRAD` 에서만 가져온다.
- 서바이버즈는 **가로 고정 960×540**이고 테마(다크 네온 / 라이트)를 진입 시 고른다. 라이트에서는 발광 대신
  외곽선으로 그린다 — 렌더에서 색을 직접 쓰지 말고 `theme.ts`의 `neon()`/`outline()`을 거칠 것.
- **아울 레스토랑(`games/chef/`)은 코딩 음식 25종을 레시피 순서대로 쌓아 내는 타임어택 타이쿤**이다. 한 판이 1 → 25 → ∞ 로 이어지고(한 단계에 새 음식 하나)
  **단계는 끝낸 주문 수로 정해진다**(`config.ts` 의 `STAGES[].orders` · `stageOf` = 서버 `chef_stage`). 25단계 마지막 주문은 풀스택 코스요리.
  단계 곡선은 공통 `lib/stages.ts`(15단계에서 멈춤) 대신 25단계까지 오르는 자기 `curveOf` 다 — 서버 `chef_mult` 와 같이 고친다.
  재료 22종의 손질 경로(`data/items.ts`)와 레시피(`data/recipes.ts`, `"@pan:fry"` = 접시 통째로 마무리)는 데이터이고,
  엔진(`engine/game.ts`)은 DOM 을 모른다 — 화면(`ui/`, DOM + SVG, 20Hz)과 헤드리스 봇(`engine/bot.ts`)이 같은 행동 함수만 부른다.
  **탭 한 번 = 한 단계**(재료는 손질 도구나 선택된 접시로 자동 배송), 드래그는 목적지 지정, 키보드도 있다.
  인내도 0 = 즉시 게임 오버, 🐛 버그는 경고(1초 기어 옴) 뒤에만 앉는다. 점수·거부 식은 `engine/score.ts` 의 `serverRaw`·`serverReject` 가
  SQL(`chef_raw`·`chef_reject_reason`)의 TS 사본이고 `tests/chef-engine.test.ts` 가 봇 판·마이그레이션 문자열로 대조한다.
- **아울러닝(`games/flight/`)은 고정 타임스텝(1/60) + 청크 기반 레벨**이다. 로직(`engine/`)과 렌더(`engine/render.ts`),
  HUD(DOM, `hud/`)를 분리해 두었고, 같은 물리 함수를 청크 검증기(`chunks/verify.ts`)와 봇(`engine/bot.ts`)이 공유한다.
  레벨을 추가하면 `npm run verify:chunks`가 S·M·L 모두에게 통과 경로가 있는지 확인한다.
  **2.0(GDD §20)**: 공통 `stageFromRatio` 대신 **거리 기반 자기 단계표**(`CFG.stages` 15단계 → `CFG.infinite` ∞)를 쓰고,
  P0~P4 는 청크 풀용 내부 난이도로 남았다. 단계의 새 요소(레이저·움직이는 벽·중력 반전·색 체인·폭격…)는
  **세트피스 = 코드로 만드는 청크**(`engine/director.ts`)로 끼우고, 스포너는 **청크를 놓는 자리의 단계**로 고른다.
  레이저·미사일은 화면 좌표 위험 요소(`engine/hazards.ts`)이고 **즉사가 아니라 에너지 피해** — 즉사는 벽뿐이다.
  연출(레이저·미사일·점수 팝업·화면 효과)은 `engine/overlay.ts`, 효과음은 엔진이 `g.cues`(`CUE`) 비트만 세우고 index.tsx 가 `playSfx`.
  점수 배율 몫은 `bonus_score` 로 따로 보내고 서버 `flight_raw`·`flight_reject_reason` 헬퍼가 같은 식으로 재계산한다 —
  **점수식을 바꾸면 `engine/score.ts` + 두 헬퍼(새 마이그레이션) + `tests/flight-sim.test.ts` 를 같이** 고친다.
- 모바일 우선. 버튼 최소 터치 영역 44px(`components/ui/Button.tsx`의 size 토큰이 보장).
- **플레이어가 보는 문구는 코드에 직접 쓰지 말고 `messages/ko.json`·`messages/en.json`에 넣는다**
  (서버는 `getTranslations`, 클라이언트는 `useTranslations`). 관리자·부스·전광판은 한국어 그대로 둔다.
- 화면 크기(`--ui-scale`)·소리·테마는 `/settings`에서 바꾸고 기기에만 저장된다 (`lib/prefs.ts`·`lib/theme.ts`).
  효과음은 파일 없이 WebAudio로 합성한다 (`lib/sound.ts`) — 새 소리를 넣으려면 `PATTERNS`에 음만 적으면 된다.
  **예외: 아울 서바이버즈는 녹음된 효과음(Kenney CC0, `public/assets/kenney-*-sounds/` 등)과 배경음악을 쓴다** —
  엔진은 `world.cues`에 `CUE` 비트만 세우고, 소리 이름·파일·음량·간격은 `games/survive/audio.ts`(`SOUNDS`·`BGM`) 한 곳이다.
  샘플이 아직 없으면 합성음(`fallback`)으로 대신한다. 배경음악은 `lib/sound.ts`의 `playMusic`(크로스페이드, 음량은 설정의 "배경음악").
- **게임 로고 4종은 사용자 그림**(`scripts/src/game-logos.webp` → `scripts/slice-game-logos.py` → `public/assets/logos/<game>.webp`)이고 `components/GameLogo.tsx`로 로비·첫 화면·게임 인트로에 그린다. 게임을 추가하면 로고도 같이 넣을 것.
- 플랫폼 UI는 이미지 에셋 없이 SVG·도형으로 그린다 (`components/brand/Logo.tsx`, `GachaMachine.tsx`).
- **예외: 브랜드 그림은 사용자가 준 두 장**(`scripts/src/brand-frame.webp`·`brand-owl.png` → `scripts/slice-brand.py`)이다.
  스크립이 프레임 안에 이름을 얹어 `public/assets/brand/banner.webp`(+`-light`)·`owl.webp`(+`-light`) 와 `app/icon.png`·`apple-icon.png`·`opengraph-image.png` 를 만든다.
  화면에서는 `components/brand/BrandBanner.tsx`(랜딩 히어로·로비 맨 위)·`OwlMark.tsx`(헤더·티켓·에러 화면)를 쓰고,
  라이트 테마에서는 CSS 의 `.brand-night`/`.brand-day` 가 **진한 사본**으로 바꿔 끼운다 (DECISIONS §5-36).
  **예외: 랭크 뱃지 17종은 사용자가 준 시트**(`scripts/src/rank-sheet.webp` → `scripts/slice-rank-badges.py` → `public/assets/ranks/rank-00~16.webp`)를 `RankBadge.tsx`가 `<img>`로 그린다. 순서는 `RANKS` 순서와 같다.
- **아울러닝 2.0 그림은 사용자가 준 시트 두 장**이다 — 리소스 시트(`public/assets/owlrun/*.webp`, `scripts/slice-owlrun-sheet.py`)와
  캐릭터 시트(`public/assets/owlrun/char/*.webp`, `scripts/slice-owlrun-character.py`, 외곽선 스티커 스타일 · 2배로 키운 고해상도).
  부엉이는 큰 색별 그림에 **날갯짓을 코드로** 입히고, 피격·기절·부활·승리 같은 자세는 엔진의 `g.pose` 로 고른다. 혜성 꼬리·문구 그림(PERFECT/NEAR MISS/COMBO/FEVER)·돌벽·톱니·미사일·아이템·단계별 하늘·이벤트 카드.
  그리는 곳은 `engine/sprites.ts`(부엉이·아이템·벽·하늘)·`engine/overlay.ts`(문구·미사일·파동·터보)이고, **그림이 없으면 전부 기존 도형 폴백**.
- **아울러닝만 외부 CC0 에셋을 쓴다** — `games/flight/engine/assets.ts`가 `public/assets/`의 Kenney 텍스처를
  로드해 틴팅/패턴으로 캔버스에 얹는다. 로딩 전에는 항상 도형 폴백으로 그려야 한다(에셋 없이도 게임이 돈다).
  새 에셋을 추가하면 `public/assets/CREDITS.md`에 출처·커밋·라이선스를 반드시 적을 것.
- **예외: 아울 서바이버즈의 부엉이는 사용자가 준 스프라이트**(`public/assets/survive-owl/*.webp`,
  로더 `games/survive/engine/assets.ts`)다. 방향(정면·후면·좌·우)·이동 5프레임·감정·피격·사망·레벨업·화살·베기·마법진이 있고,
  로딩 전에는 도형 폴백으로 그린다. **몬스터 14종도 사용자 그림**(시트 `scripts/src/survive-mobs.webp` → `scripts/slice-survive-mobs.py` → `public/assets/survive-mobs/*.webp`, `assets.ts`의 `MOB_ART`에
  몸통 비율)이고, 로딩 전에는 네온 도형으로 그린다. **장애물 5종도 사용자 그림**(`public/assets/survive-obstacles/*.webp`,
  `assets.ts`의 `OBSTACLE_ART`에 단단한 부분 비율)이고 **체력 절반 아래면 `-broken` 그림**으로 바뀐다. 탄은 여전히 도형이다.
- **아울 레스토랑의 음식 25종 · 재료 · 주방 도구도 사용자가 준 시트 그림**(`public/assets/chef/`, `scripts/slice-chef-sheet.py`)이다.
  두 번째 시트(`scripts/slice-chef-extras.py`)의 손님 8명·버그 4종·UI 아이콘·연출 배지·장식도 쓴다.
  `games/chef/ui/art.tsx` 의 `Art`/`DishIcon`/`ToolIcon`/`UiIcon`/`Badge`/`Decor`/`BugArt` 를 거치고, 그림을 못 받으면 이모지·SVG·글자로 그린다.
- 서바이버즈 **색의 역할**(`games/survive/theme.ts`): 내 공격 = 차가운 파랑·가늘고 긴 빛줄기 / 적 공격 = 뜨거운 빨강~자홍 (적 몸은 그림 색 그대로 — `theme.mobs`),
  적 탄은 둥근 구체 + 어두운 외곽선 + 맥동 고리 / 경험치 = 금색 보석 / 얼음 = 서리색(밝고 반투명). **두 계열이 같아 보이면 안 된다.**
  파티클·이펙트 색은 번호(`world.ts`의 `PC`)로 넘기고 렌더가 테마 색으로 바꾼다.

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
- 랭크 뱃지 그림은 `public/assets/ranks/`(사용자 제공), 이름·글자색은 `lib/rank.ts`의 `RANKS`에서 나온다 (챌린저는 파티클 유지).

## 자주 건드리는 곳

| 하고 싶은 일 | 파일 |
|---|---|
| 레벨 곡선·랭크 구간 | `lib/rank.ts` + `supabase/migrations/*.sql` + `tests/rank.test.ts` |
| 포인트 식(기본·분당·K) | `app_config.game_points`·`game_k` (관리자 화면에서 수정) — 식은 DB `public.game_points` 한 곳 + TS 사본 `lib/games.ts` 의 `estimatePoints` (`20261007000000_points_v2.sql`). **한 판 상한 없음** |
| 게임 제한시간 | `app_config.game_limits` (DB), 표시는 `lib/config.ts` |
| 아울러닝 물리·에너지·점수 튜닝 | `games/flight/config.ts`의 `CFG` 한 곳 (매직넘버 금지) |
| 아울러닝 레벨 디자인 | `games/flight/chunks/p0~p4.json` → `npm run verify:chunks`로 통과 가능성 검증 |
| 아울러닝 단계·세트피스·이벤트 | 단계표 `CFG.stages` · 단계별 소개/세트피스/이벤트 풀 `engine/director.ts` (새 세트피스는 `tests/flight-v2.test.ts` 의 BFS 목록에 추가) |
| 공통 15단계 곡선 | `lib/stages.ts` (`STAGE_STEP`) — 바꾸면 STAGE 를 쓰는 게임 전부 난이도가 바뀐다 (아울리스는 제외) |
| 아울 서바이버즈 튜닝 | `games/survive/config.ts`의 `CFG` (단계·스폰·보스별 블록 `hexa`/`nona`/`trideca`/`chrono`) + 몬스터 스펙은 `data/stages.ts` |
| 아울리스 튜닝 | `games/owlis/config.ts`의 `CFG` (난이도 `difficulty` · AI 표 `ai` · 중력 `gravity` · 점수 `score` · 공격 `attack`) — `maxUp`·`timeRamp`·`koBump`·점수 표를 바꾸면 `20261002000000_owlis.sql` 식과 `app_config.game_guards.owlis` 도 같이 |
| 아울리스 AI 판단(평가 가중치) | `games/owlis/engine/ai.ts` 의 `W` (모양·연쇄 잠재력·발사/쌓기 판단) |
| 아울 레스토랑 튜닝 | `games/chef/config.ts` 의 `CFG`(인내도 `patience` · 등장 `spawn` · 버그 `bugs` · 점수 `score` · ∞ `infinite`) + 단계표 `STAGES` — 점수·단계식을 바꾸면 `20261005000000_chef.sql` 헬퍼도 같이 |
| 아울 레스토랑 음식·재료 추가 | `games/chef/data/recipes.ts` · `data/items.ts` + 이름은 `hud.chef.recipes`·`items`·`labels` (해금 단계 규칙은 `tests/chef-engine.test.ts` 가 검증) |
| 서바이버즈 장애물 | 종류·크기·체력 `games/survive/engine/obstacles.ts` 의 `OBSTACLE_KINDS` + 가중치 `CFG.obstacle.kindWeights` + 그림 `public/assets/survive-obstacles/`(`assets.ts` 의 `OBSTACLE_ART`, 자르기 `scripts/slice-survive-obstacles.py`) |
| 서바이버즈 스킬 추가·수정 | `games/survive/data/skills.ts` (동작은 `engine/skills.ts`의 유형 핸들러) |
| 서바이버즈 보스 패턴 | `games/survive/engine/bosses/*.ts` (공통 경고·레이저는 `common.ts`) |
| 서바이버즈 가이드(시작 화면) | `games/survive/ui/Guide.tsx` — 이름·수치는 데이터·`CFG`에서 자동, 문장만 `hud.survive.guide` (보스 패턴을 추가하면 `BOSS_PATTERNS`에도) |
| 서바이버즈 거부 기준 | `app_config.game_guards.survive` (DB) — 배포 없이 조정 가능 |
| 원점수 상한·자동 잠금·검토 보류 | `app_config.security` (DB, 관리자만 읽힘) — `max_raw_per_min`·`raw_flat`·`auto_lock`·`play`(진행 한도)·`review`. 잠금 해제는 관리자 → 유저, 검토 완료는 관리자 → 로그 |
| 로그인·가입 입력 규칙·시도 제한 | `lib/validate.ts` + `profiles_validate` 트리거 · `lib/rate-limit.ts` |
| 뽑기 확률·상품 | `app_config.gacha_table`, `prizes` 테이블 (관리자 화면에서 재고 수정) |
| 부스 위치 안내 | `app_config.booth_location` |
| 아울 에너지(스태미나) | `app_config.owl_energy` (DB) · 표시 기본값은 `lib/config.ts` · 게임 내 드롭은 각 게임 `config.ts`의 `CFG.owlEnergy` (서버 조건과 같은 값이어야 한다) |
| 실시간 등수·변동 표시 | `components/RankDelta.tsx` · `components/LiveRefresh.tsx` · `games/core/useGameSession.ts`의 `position` |
| 플랫폼 색·유리 질감 | `app/globals.css`의 `@theme` + `.card`/`.grad-line` — 캔버스 쪽 복제본은 `games/core/canvas.ts`의 `COLORS`, 게임 테마는 `games/*/theme.ts` |
| 라이트 테마 색 | `app/globals.css`의 `:root[data-theme="light"]` 한 블록 |
| 브랜드 배너·부엉이 마크 | 자르기 `scripts/slice-brand.py` (원본 `scripts/src/brand-*`) → `public/assets/brand/` · 화면은 `components/brand/BrandBanner.tsx`·`OwlMark.tsx` |
| 화면 문구(한/영) | `messages/ko.json` · `messages/en.json` (두 파일의 키가 **같아야** 한다) |
| 설정 항목 추가 | `components/SettingsScreen.tsx` + 저장은 `lib/prefs.ts`(기기) / `lib/locale.ts`(쿠키) |
| 효과음 | `lib/sound.ts`의 `PATTERNS` (파일 없이 WebAudio 합성) |
| 버튼 클릭음 | `lib/sound.ts` 의 `UI_CLICK`·`playClick()` (사용자 샘플 `public/assets/ui/button-click.mp3`, 없으면 합성음 `tap`) — 무는 곳은 `components/SoundBoot.tsx` |
| 레벨업·랭크업 징글 | `lib/sound.ts` 의 `LEVEL_UP`·`RANK_UP`·`playLevelUp()` (사용자 샘플 `public/assets/ui/level-up.mp3`·`rank-up.mp3`, 없으면 합성음 `level`·`legend`) — 부르는 곳은 `components/LevelUpOverlay.tsx` |
| 서바이버즈 효과음·배경음악 | `games/survive/audio.ts`의 `SOUNDS`(효과음) · `BGM`(곡 경로, 파일은 `public/assets/survive-bgm/`) — 새 사건은 `world.ts`의 `CUE`에 비트를 추가하고 `CUE_SOUNDS`에 연결 |
| 아울리스 배경음악 | `games/owlis/audio.ts` (`BGM`·`LATE_LEVEL` — 후반/위기 곡 전환, 파일은 `public/assets/owlis-bgm/`) |
| 아울러닝 배경음악 | `games/flight/audio.ts` (`BGM`·`LATE_STAGE` — 후반 단계·OVERDRIVE 곡 전환, 파일은 `public/assets/flight-bgm/`) |
| 동아리 가입 배너·링크 | `components/JoinClubBanner.tsx` 의 `CLUB_APPLY_URL` + 문구 `messages/*.json` 의 `club.*` |
| 제작진·개인정보·경품 고지 | `app/about/page.tsx` + 문구는 `messages/*.json` 의 `about.*` (배열은 `t.raw`). 들어가는 곳: 설정 하단·첫 화면 푸터·티켓 확률표 아래 |
| 관리자 화면 | `components/admin/AdminPanel.tsx` (대시보드·승인·유저·재고·설정·로그) |
| 운영 값을 화면에서 바꾸기 | `admin_set_config` 화이트리스트(최신 본문은 `supabase/migrations/20261007000000_points_v2.sql`) + `lib/rpc.ts`의 `setConfigValue` |
| 관리자 대시보드 집계 | `admin_stats()` RPC — 항목을 늘리면 `lib/types.ts`의 `AdminStats`도 같이 고친다 |

## 주의

- 공개 레포다. `.env*`는 커밋하지 않는다 (`SUPABASE_SERVICE_ROLE_KEY`는 서버 전용).
- staff는 RLS상 전체 `profiles`/`tickets`/`draws`를 볼 수 있으므로, "내 것"을 조회할 때는 `user_id` 필터를 꼭 건다.
- 미들웨어(`middleware.ts`)가 role·verified·운영시간을 검사하지만 **최종 판단은 항상 서버 RPC**다.
- 관리자·부원이 **남의** 계정/설정/재고를 바꾸면 `admin_audit`에 자동으로 남는다(테이블 트리거).
  새 관리 기능을 만들 때 로그를 따로 심을 필요가 없다 — 대신 본인이 본인 행을 바꾸는 경로는 기록되지 않는다.
- 마스터 관리자 학번(`app_config.master_admin`)은 **관리자가 0명일 때만** 승격시킨다. 기본값은 공개돼 있으니
  행사 전에 바꾸라고 안내할 것.
