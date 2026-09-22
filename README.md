# 🦉 아울게임즈 (OWL GAMES)

S.OWL 동아리 부스 행사용 웹 미니게임 플랫폼.
게임 플레이 → 포인트 → 레벨·랭크 상승 → 뽑기 티켓 → **S.OWL 부스 방문** → 부스에서 뽑기.

설계 근거는 [`OWLGAMES_SPEC.md`](OWLGAMES_SPEC.md)(플랫폼)와 [`OWLRUNNING_GDD.md`](OWLRUNNING_GDD.md)(아울러닝 게임 기획),
구현하며 내린 결정은 [`DECISIONS.md`](DECISIONS.md)에 있습니다.

## 스택

- **Next.js 15 (App Router) + TypeScript + Tailwind CSS v4**
- **Supabase** — Auth / Postgres / Realtime. 점수·포인트·레벨·티켓·추첨은 전부 `security definer` RPC에서 처리
- 게임은 **Canvas 2D + requestAnimationFrame** 직접 구현 (게임 엔진 라이브러리 없음)
- 폰트: Pretendard(본문) · JetBrains Mono(숫자·코드)

## 빠르게 실행

```bash
npm install
npm run dev
```

`.env.local`이 없으면 **데모 모드**로 뜹니다. Supabase 없이도 모든 화면을 가짜 데이터로 볼 수 있어요
(게임도 플레이 가능하지만 점수는 저장되지 않습니다).

## Supabase 연결

1. Supabase 프로젝트를 만들고 `.env.local.example`을 복사해 `.env.local` 작성

   ```bash
   cp .env.local.example .env.local
   ```

2. 마이그레이션 적용 — SQL 편집기에 `supabase/migrations/*.sql` 내용을 붙여넣거나

   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```

3. Auth 설정: 이메일 확인(Confirm email) **끄기**. 가입은 학번을 `학번@owlgames.local` 이메일로 매핑합니다.
   `SUPABASE_SERVICE_ROLE_KEY`를 넣으면 확인 메일 없이 서버에서 계정을 생성합니다.
4. 첫 관리자 지정 (SQL 편집기):

   ```sql
   update profiles set role = 'admin', verified = true where student_id = '202612345';
   ```

5. Realtime: `board_events`, `profiles` 퍼블리케이션은 마이그레이션에서 등록됩니다.

## 화면

| 라우트 | 접근 | 내용 |
|---|---|---|
| `/` | 전체 | 랜딩 · 운영시간 · 게임/상품 안내 |
| `/auth/signup` `/auth/login` | 비로그인 | 이름·학번·비밀번호 |
| `/pending` | 미인증 | 학번 인증 대기 (승인되면 Realtime으로 자동 이동) |
| `/lobby` | 인증 유저 | 랭크·경험치·티켓 배너·게임 3종·미니 랭킹 |
| `/game/typer` `/game/flight` `/game/phish` | 인증 유저 | 나이트 타이퍼 · 아울러닝 · 피싱 헌터 → 결과 모달 |
| `/rank` `/ticket` `/me` | 인증 유저 | 랭킹 · 코드 발급 · 내 기록 |
| `/booth` | staff+ | 부스 키오스크 (코드 조회 · 추첨 · 수령 · 가입 승인) |
| `/board` | 공개 | 부스 전광판 (랭킹 · 통계 · 재고 · 티커) |
| `/admin` | admin | 승인 · 유저 · 재고 · 운영시간 · 로그 |

## 명령어

```bash
npm run dev        # 개발 서버
npm run lint           # eslint
npm run typecheck      # next typegen → tsc --noEmit
npm test               # vitest 전체
npm run verify:chunks  # 아울러닝 청크가 통과 가능한지 물리 시뮬로 검증
npm run sim:flight     # 아울러닝 자동 봇 시뮬레이션 (SIM_RUNS=1000 으로 늘려 튜닝)
npm run build          # 프로덕션 빌드
```

DB 검증 스크립트는 `supabase/tests/`에 있습니다 (레벨 곡선, 추첨 10만회 시뮬레이션).

## 디렉토리

```
app/          # 라우트 (route group (player)에 로비·랭킹·티켓·내기록)
components/   # UI · 랭크 뱃지 · 경험치 바 · 뽑기 기계 · 전광판 · 부스 · 관리자
games/        # core(루프·캔버스·세션) + typer / flight(아울러닝) / phish
              #   flight/: config(튜닝 상수) · engine(물리·에너지·청크·점수·렌더) · chunks(레벨 프리팹) · hud
data/         # 타이퍼 단어, 피싱 카드
lib/          # supabase 클라이언트, 랭크·설정·포맷, 조회·RPC 래퍼, 데모 데이터
supabase/     # migrations, tests
```

## 보안 메모

- 클라이언트는 포인트·티켓·추첨 결과를 직접 쓰지 못합니다. 모든 테이블 RLS 활성화, 쓰기는 RPC 경유.
- 이름은 랭킹·전광판에서 가운데 글자를 마스킹합니다 (`leaderboard` 뷰).
- 한 판 최대 300P + 세션 경과시간 검증 + 유저당 active 세션 1개로 어뷰징을 제한합니다.
