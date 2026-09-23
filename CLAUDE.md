# 아울게임즈 (OWL GAMES)

S.OWL 부스 행사용 웹 미니게임 플랫폼. 플랫폼 설계는 [`OWLGAMES_SPEC.md`](OWLGAMES_SPEC.md),
아울러닝(=`flight`) 게임 설계는 [`OWLRUNNING_GDD.md`](OWLRUNNING_GDD.md)가 원본이고,
명세에 없어서 판단한 것들은 [`DECISIONS.md`](DECISIONS.md)에 기록한다. **새 결정은 반드시 DECISIONS.md에 추가할 것.**

## 스택 / 실행

- Next.js 15 App Router + TypeScript + Tailwind CSS v4 + Supabase(Auth/Postgres/Realtime)
- `npm run dev` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run build`
- `.env.local`이 없으면 **데모 모드**(`lib/env.ts`의 `isDemo`)로 동작한다. 새 화면을 만들 때도
  Supabase 없이 렌더되게 유지할 것 — 조회는 `lib/queries.ts`(서버)·`lib/client-queries.ts`(클라이언트)에
  데모 폴백을 함께 넣는다.

## 아키텍처 원칙

- **포인트·레벨·랭크·티켓·추첨·아울 에너지는 전부 서버(Postgres RPC, `security definer`)에서 계산한다.**
  클라이언트는 `lib/rpc.ts` 래퍼로만 호출하고, 결과를 표시만 한다.
- `lib/rank.ts`는 DB 함수(`level_from_points` 등)와 **같은 수식**이어야 한다. 바꾸면 양쪽 + `tests/rank.test.ts`를 함께 고친다.
- 게임은 Canvas 2D + rAF 직접 구현(엔진 금지). 공통 루프·캔버스 헬퍼는 `games/core/`.
  피싱 헌터만 한글 가독성·접근성 때문에 카드 UI를 DOM으로 그린다.
- **아울러닝(`games/flight/`)은 고정 타임스텝(1/60) + 청크 기반 레벨**이다. 로직(`engine/`)과 렌더(`engine/render.ts`),
  HUD(DOM, `hud/`)를 분리해 두었고, 같은 물리 함수를 청크 검증기(`chunks/verify.ts`)와 봇(`engine/bot.ts`)이 공유한다.
  레벨을 추가하면 `npm run verify:chunks`가 S·M·L 모두에게 통과 경로가 있는지 확인한다.
- 모바일 우선. 버튼 최소 터치 영역 44px(`components/ui/Button.tsx`의 size 토큰이 보장).
- 플랫폼 UI는 이미지 에셋 없이 SVG·도형으로 그린다 (`components/brand/OwlMark.tsx`, `RankBadge.tsx`, `GachaMachine.tsx`).
- **아울러닝만 외부 CC0 에셋을 쓴다** — `games/flight/engine/assets.ts`가 `public/assets/`의 Kenney 텍스처를
  로드해 틴팅/패턴으로 캔버스에 얹는다. 로딩 전에는 항상 도형 폴백으로 그려야 한다(에셋 없이도 게임이 돈다).
  새 에셋을 추가하면 `public/assets/CREDITS.md`에 출처·커밋·라이선스를 반드시 적을 것.

## 디자인 시스템 (§13)

- 토큰은 `app/globals.css`의 `@theme`: `night`(배경 #0B1020) · `panel`(#141B33) · `neon`(앰버 #FFB020) ·
  `aqua`(#3DD9EB) · `alert` · `ok` · `ink` / `mute` / `dim`, 반경 `rounded-card`(20px) · `rounded-tile`(14px).
- 유틸: `.card` / `.card-solid`(반투명 패널), `.num`(JetBrains Mono + tabular-nums), `.text-glow`, `.grid-bg`, `.hex`.
- 배경은 `body`에 깔리는 `.night-sky`(별·달빛 그라데이션) + `.scanlines`. 페이지에서 따로 배경을 칠하지 말 것.
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
| 뽑기 확률·상품 | `app_config.gacha_table`, `prizes` 테이블 (관리자 화면에서 재고 수정) |
| 단어·피싱 카드 추가 | `data/typer-words.ts`, `data/phish-cards.ts` (형식은 `tests/data.test.ts`가 검증) |
| 부스 위치 안내 | `app_config.booth_location` |
| 아울 에너지(스태미나) | `app_config.owl_energy` (DB) · 표시 기본값은 `lib/config.ts` · 게임 내 드롭은 `games/flight/config.ts`의 `CFG.owlEnergy` |

## 주의

- 공개 레포다. `.env*`는 커밋하지 않는다 (`SUPABASE_SERVICE_ROLE_KEY`는 서버 전용).
- staff는 RLS상 전체 `profiles`/`tickets`/`draws`를 볼 수 있으므로, "내 것"을 조회할 때는 `user_id` 필터를 꼭 건다.
- 미들웨어(`middleware.ts`)가 role·verified·운영시간을 검사하지만 **최종 판단은 항상 서버 RPC**다.
