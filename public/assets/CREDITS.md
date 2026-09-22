# 외부 에셋 출처 및 라이선스 (Third-party assets)

> 이 폴더의 모든 파일은 외부에서 가져온 **서드파티 에셋**이며, 각 팩의 라이선스 원문은 해당 팩 폴더 안에 `LICENSE` 파일로 함께 보관되어 있습니다.

| 팩 이름 | 출처(URL) | 커밋/태그 | 라이선스 | 저작자 | 사용 파일 |
| --- | --- | --- | --- | --- | --- |
| `kenney-particle-pack` | https://github.com/Calinou/kenney-particle-pack | `ab7086639ee73be31abd87feb21bf1402d4e8144` | CC0 1.0 (퍼블릭 도메인) | Kenney Vleugels (kenney.nl) — 필터 템플릿 추가 크레딧: Indigo Ray, Craig Nisbet, Zoltan Erdokovy, Heliagon, ThreeDee, Killst4r, Tim2501 | `spark_06.png`, `spark_07.png`, `star_04.png`, `star_08.png`, `circle_05.png`, `light_01.png`, `flare_01.png`, `magic_04.png`, `smoke_03.png`, `smoke_06.png`, `trace_01.png`, `trace_07.png` (원본 경로: `addons/kenney_particle_pack/`) |
| `kenney-prototype-textures` | https://github.com/Calinou/kenney-prototype-textures | `20c808e3ce0b711684b0b6d177f011a002fb5708` | CC0 1.0 (퍼블릭 도메인) | Kenney Vleugels (kenney.nl) | `dark_texture_01.png`, `dark_texture_04.png`, `dark_texture_05.png`, `dark_texture_11.png`, `dark_texture_13.png` (원본 경로: `addons/kenney_prototype_textures/dark/texture_NN.png`) |
| `kenney-light-masks` | https://github.com/shorepine/kenney (원본 배포처: https://kenney.nl/assets/light-masks) | `3694c6879e487c108f55677be7dd2ca75b07cc3b` | CC0 1.0 (퍼블릭 도메인) | Kenney (kenney.nl) | `cone_a_blur.png`, `cone_c_blur.png`, `window_b_blur.png` (원본 경로: `2d/Light Masks/Transparent/`) |
| `orbitron` | https://github.com/google/fonts/tree/main/ofl/orbitron | `8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5` | SIL Open Font License 1.1 (OFL) | The Orbitron Project Authors (https://github.com/theleagueof/orbitron) — 예약 폰트명 "Orbitron" | `orbitron-variable.ttf` (원본 파일명 `Orbitron[wght].ttf` — 번들러가 대괄호를 싫어해서 이름만 바꿈, 가변 폰트 wght 400–900) |

## 팩별 비고

### `kenney-particle-pack`
- 12장 모두 **512×512 / 팔레트 PNG + 알파**, RGB 편차 0 = 완전 그레이스케일이라 캔버스에서 그대로 **틴팅(tint)** 가능.
- 라이선스 원문(`LICENSE`)은 레포 루트 `LICENSE.txt`와 동일하며, 팩 이름("Particle Pack 1.1")과 CC0 문구가 명시되어 있음.

### `kenney-prototype-textures`
- 5장 모두 **1024×1024 / 불투명 그레이스케일**, 가로·세로 양방향 **이음매 없음(seamless)** 을 픽셀 단위로 검증함(좌우/상하 끝단 열·행 차이 0).
- `dark/` 변형만 받았으므로 어두운 회색 계열 → 다크 네이비 벽면에 곱하기/오버레이로 얹기 적합.

### `kenney-light-masks`
- ⚠️ **라이선스 파일에 대한 주의**: 이 팩은 Kenney 전체 라이브러리 미러 레포(`shorepine/kenney`)에서 받았습니다. 해당 레포에는 팩별 라이선스 파일이 없고 루트에 `LICENSE.txt` 하나만 있는데, 그 파일의 머리말이 다른 팩 이름("Castle Kit (2.0)")으로 되어 있습니다. 옆에 복사해 둔 `LICENSE`는 그 파일의 **원문 그대로**입니다. 자세한 근거는 같은 폴더의 `NOTICE.md`를 참고하세요.
- 라이선스는 원 배포처 https://kenney.nl/assets/light-masks 에서 **CC0**임을 별도로 직접 확인했습니다.
- 3장 모두 **512×512**, 순백(휘도 255) + 알파 그라디언트 → 마스크/틴트 용도로 이상적.

### `orbitron`
- OFL 1.1은 폰트 파일을 게임에 임베드·재배포할 수 있으나, **폰트 파일 단독 판매 금지**와 **예약 폰트명("Orbitron") 유지** 조건이 있습니다. 파생 폰트를 만들 경우에만 이름을 바꿔야 하며, 그대로 쓰는 경우에는 제약이 없습니다.
