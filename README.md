# 🦉 아울게임즈 (OWL GAMES)

S.OWL 동아리 부스 행사용 웹 미니게임 플랫폼.
게임 플레이 → 포인트 → 레벨·랭크 상승 → 뽑기 티켓 → **S.OWL 부스 방문** → 부스에서 뽑기.

설계 근거는 [`OWLGAMES_SPEC.md`](OWLGAMES_SPEC.md)(플랫폼)와 게임 기획서
[`OWLRUNNING_GDD.md`](OWLRUNNING_GDD.md) · [`OWLSURVIVORS_GDD.md`](OWLSURVIVORS_GDD.md) ·
[`OWLIS_GDD.md`](OWLIS_GDD.md) · [`OWLRESTAURANT_GDD.md`](OWLRESTAURANT_GDD.md),
구현하며 내린 결정은 [`DECISIONS.md`](DECISIONS.md)에 있습니다.

## 게임 4종

| 게임 | 한 판 | 조작 | 특징 |
|---|---|---|---|
| 🦉 아울러닝 | 최대 180초 | 한 손가락 (꾹 눌러 상승) | 청크 기반 무한 레벨 · 색 맞추기 · 크기 변화 |
| 🛡️ 아울 서바이버즈 | 최대 180초 | 가상 조이스틱 (가로 전용) | 한 판 = 한 스테이지. 보스를 잡아야 다음 스테이지가 열려요 |
| 🧩 아울리스 | 패배할 때까지 | 드래그·탭·버튼 / 키보드 (폰·PC) | 1인용 퍼즐 대전. 같은 색 4개 연쇄로 AI 에게 방해 블록 — AI 가 내 실력을 보고 LEVEL 1 → 5 → 5+ 로 진화 |
| 🍳 아울 레스토랑 | 손님이 지칠 때까지 (최대 20분) | 탭·드래그 / 키보드 (폰·PC) | 코딩 음식 25종을 레시피 순서대로 요리해 테이블 3개를 챙기는 타이쿤. 🐛 버그가 앉은 테이블엔 내면 안 된다 · 25단계(한 단계에 새 메뉴 하나) + ∞ |

피싱 헌터 · 아울스페이스는 행사 중 내렸습니다 (DECISIONS §5-19, 예전 기록은 그대로 남습니다).

아울리스를 뺀 게임은 **점수는 무한히 쌓이지만 체감 난이도는 15단계**로 끊어 올라갑니다
(`lib/stages.ts` — 단계마다 난이도가 1.16배씩 **곱**으로 붙고, 15단계를 넘으면 배율이 고정됩니다).
HUD와 결과 화면에 `STAGE n/15`와 **전체 등수 변동**(`14위 → 11위 ▲3`)이 함께 표시됩니다.

## 스택

- **Next.js 15 (App Router) + TypeScript + Tailwind CSS v4**
- **next-intl** — 한국어/English 전환 (URL은 그대로, 쿠키로 고름)
- **Supabase** — Auth / Postgres / Realtime. 점수·포인트·레벨·티켓·추첨은 전부 `security definer` RPC에서 처리
- 게임은 **Canvas 2D + requestAnimationFrame** 직접 구현 (게임 엔진 라이브러리 없음)
- 폰트: Pretendard(본문) · JetBrains Mono(숫자·코드)

## 설정 (`/settings`)

로그인 없이도 열립니다. 바꾼 값은 **그 기기에만** 저장되고 점수·랭크에는 영향이 없어요.

- 🌗 **테마** — 다크/라이트. 스위치를 누르면 해가 호를 그리며 뜨고 집니다
- 🔎 **화면 크기** — 90 / 100 / 112 / 125% (글자와 버튼이 같이 커져요)
- 🔊 **소리** — 효과음 on/off + 음량 (오디오 파일 없이 WebAudio로 합성합니다)
- 🌐 **언어** — 한국어 / English (플레이어가 보는 화면 전부. 관리자·부스 화면은 한국어)

## 빠르게 실행

```bash
npm install
npm run dev          # http://localhost:3000
npm run dev:lan      # 같은 와이파이의 폰·아이폰에서 http://<PC의 IP>:3000 으로 접속
```

**가짜(데모) 데이터는 없습니다.** 모든 화면이 Supabase 의 실제 데이터를 읽으므로 `.env.local` 을 먼저 채워야 합니다.
비어 있으면 상단에 "Supabase 미설정" 배너가 뜨고, 로그인이 필요한 화면은 로그인 화면으로 돌아갑니다.

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
4. **첫 관리자 만들기 — 마스터 학번 `999999999`**

   마이그레이션을 적용한 직후 `999999999` 로 회원가입하면 그 계정이 **자동으로 관리자 + 인증 완료**가 됩니다
   (비밀번호는 가입할 때 직접 정합니다). SQL 편집기를 열 필요가 없어요.

   - 이 학번은 **관리자가 한 명도 없을 때만** 동작합니다(`bootstrap_only`). 첫 관리자가 생기면 효력이 사라져요.
   - 공개 레포라 번호가 노출돼 있으니, 관리자가 된 뒤 `/admin → 설정 → 마스터 관리자`에서
     **본인 학번으로 바꾸세요.**
   - SQL 로 직접 지정하고 싶으면:

     ```sql
     update profiles set role = 'admin', verified = true where student_id = '202612345';
     ```

5. Realtime: `board_events`, `profiles` 퍼블리케이션은 마이그레이션에서 등록됩니다.

## 아울 에너지 (스태미나)

포인트만 노리고 무한 반복하는 걸 막기 위해, 게임 한 판에 **아울 에너지 1개**가 듭니다.

| 규칙 | 값 |
|---|---|
| 자동 충전 | **10분마다 1개**, 최대 **10개** |
| 게임 1판 | 1개 소모 (`start_game_session`이 서버에서 차감) |
| 부스 충전 | S.OWL 부스 미션 성공 시 부원이 `/booth` → 🦉 에너지 충전 탭에서 지급 (1~5개, 상한 20개까지) |
| 게임 중 획득 | 높은 단계까지 가면 낮은 확률로 등장 (하루 5개까지) — 아울러닝 **P3(900m) 이상** · 서바이버즈 **구역 3 돌파 또는 보스 처치** |

- 계산은 전부 서버(`profiles.owl_energy` + `owl_energy_status()` RPC)에서 하고, 클라이언트는 표시만 합니다.
- 값 조정은 `app_config.owl_energy` (충전 간격·상한·비용·드롭 조건) 한 곳에서 합니다.
- 지급 이력은 `energy_grants` 테이블에 남습니다(누가·누구에게·왜).

## 화면

| 라우트 | 접근 | 내용 |
|---|---|---|
| `/` | 전체 | 랜딩 · 운영시간 · 게임/상품 안내 |
| `/auth/signup` `/auth/login` | 비로그인 | 이름·학번·비밀번호 |
| `/pending` | 미인증 | 학번 인증 대기 (승인되면 Realtime으로 자동 이동) |
| `/lobby` | 인증 유저 | 랭크·경험치·아울 에너지·티켓 배너·게임 4종·미니 랭킹 (30초마다 자동 갱신) |
| `/game/flight` `/game/survive` `/game/owlis` `/game/chef` | 인증 유저 | 게임 4종 → 결과 모달(등수 변동 포함) |
| `/rank` `/ticket` `/me` | 인증 유저 | 랭킹 · 코드 발급 · 내 기록 |
| `/booth` | staff+ | 부스 키오스크 (코드 조회 · 추첨 · 수령 · 가입 승인) |
| `/board` | 공개 | 부스 전광판 (랭킹 · 통계 · 재고 · 티커) |
| `/admin` | admin | 대시보드 · 승인 · 유저 · 재고 · 설정(운영시간·K값·에너지·마스터) · 로그(운영 기록) |

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

DB 검증 스크립트는 `supabase/tests/`에 있습니다 (레벨 곡선, 추첨 10만회 시뮬레이션, 게임별 제출 검증, 운영 시스템).

## 운영 (관리자)

`/admin`은 행사 당일 한 화면에서 굴리는 걸 목표로 만들었습니다.

| 탭 | 할 수 있는 것 |
|---|---|
| 대시보드 | 오늘 플레이·발행 포인트·승인 대기·게임별 통계·티켓·상품 재고·에너지 지급 (30초 자동 갱신) |
| 가입 승인 | 학번 인증 대기 목록 승인 |
| 유저 | 검색 · 역할 변경(user/staff/admin) · 아울 에너지 조정 · 계정 삭제 |
| 상품 재고 | 등수별 재고 수정 (0이면 추첨에서 제외) |
| 설정 | 운영시간 강제 제어 · 운영시간 · 아울 에너지(충전 간격/상한/비용) · 게임 K값 · 마스터 관리자 학번 |
| 로그 | 미수령 당첨 · **운영 기록(누가 무엇을 바꿨는지)** · 비정상 제출 |

- 설정 값 검사는 서버(`admin_set_config`)가 합니다. 예를 들어 K값에서 게임 하나가 빠지면 저장되지 않아요.
- 부원·관리자가 **남의** 계정·설정·재고를 바꾼 일은 전부 `admin_audit`에 남습니다
  (본인이 게임해서 바뀐 포인트·에너지는 남지 않아요).
- 점수는 게임 4종 모두 서버가 메타를 검증합니다. 조작이 의심되면 그 판은 `rejected`(0P)로 남고,
  점수만 부풀린 경우는 서버 상한으로 깎은 뒤 `meta.raw_adjusted`로 기록돼 로그 탭에 보입니다.

## 지원 브라우저

| 환경 | 상태 |
|---|---|
| Chrome · Edge · 삼성 인터넷 (2023년 이후) | ✅ |
| Firefox 128+ | ✅ |
| iOS Safari 16.4+ (아이폰 8 이후 대부분) | ✅ |
| iOS Safari 15.4 ~ 16.3 | ⚠️ 동작은 하지만 일부 반투명·색 효과가 단순해짐 |
| iOS 15.3 이하 · IE | ❌ (Tailwind v4가 `color-mix` 등 최신 CSS를 쓰기 때문) |

- 아울러닝은 **가로 화면 전용**입니다. 세로로 들면 "가로로 돌려주세요" 안내가 뜹니다.
- 서바이버즈는 세로도 되지만, 가로로 들면 보이는 범위가 넓어 훨씬 유리합니다.
- 부스 키오스크의 **QR 스캔은 `https` 주소에서만** 카메라가 열립니다 (브라우저 정책). 코드 직접 입력은 항상 가능합니다.
- 화면 어디서 오류가 나도 흰 화면 대신 안내 화면(`app/error.tsx`)이 뜨고, 오류 코드가 표시됩니다.
- 운영시간 밖에서 확인하려면 `/admin → 설정`에서 강제 열기(`force_open`)를 켭니다.

## 외부 에셋

아울러닝의 벽 텍스처·파티클·조명 마스크는 **Kenney의 CC0 에셋**, HUD 폰트는 **Orbitron(OFL)** 입니다.
출처·커밋·라이선스는 [`public/assets/CREDITS.md`](public/assets/CREDITS.md)에 정리돼 있고, 각 팩의 라이선스 원문도 함께 보관합니다.

## 디렉토리

```
app/          # 라우트 (route group (player)에 로비·랭킹·티켓·내기록)
components/   # UI · 랭크 뱃지 · 경험치 바 · 뽑기 기계 · 전광판 · 부스 · 관리자
games/        # core(루프·캔버스·세션) + flight(아울러닝) / survive / owlis(아울리스) / chef(아울 레스토랑)
              #   flight/:  config(튜닝 상수) · engine(물리·에너지·청크·점수·렌더) · chunks(레벨 프리팹) · hud
              #   survive/: data(스킬 50종·스테이지 15+·보스) · engine(월드 SoA 풀·공간해시·스킬·보스·장애물)
              #             · ui(조이스틱·HUD·전투로그·카드) · theme.ts(다크 네온 / 라이트)
              #   owlis/:   config(밸런스·AI 표) · engine(보드·블록·필드·AI·난이도·점수·렌더) · ui(HUD·터치 버튼)
              #   chef/:    config(단계표·인내도·버그·점수) · data(재료·레시피) · engine(상태 기계·점수·봇) · ui(DOM 화면)
lib/          # supabase 클라이언트, 랭크·설정·포맷, 조회·RPC 래퍼
public/assets/ # 외부 CC0 에셋 (Kenney 파티클·텍스처·라이트 마스크, Orbitron 폰트)
supabase/     # migrations, tests
```

## 보안 메모

- 클라이언트는 포인트·티켓·추첨 결과를 직접 쓰지 못합니다. 모든 테이블 RLS 활성화, 쓰기는 RPC 경유.
- 이름은 랭킹·전광판에서 가운데 글자를 마스킹합니다 (`leaderboard` 뷰).
- 포인트 = 기본 50P + 플레이 분 × 게임별 분당 + 원점수 ÷ K (상한 없음, 관리자 설정) + 세션 경과시간 검증 + 유저당 active 세션 1개로 어뷰징을 제한합니다.
