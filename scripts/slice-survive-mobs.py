"""아울 서바이버즈 몬스터 시트(사용자 제공, 검은 배경 RGB) → public/assets/survive-mobs/*.webp

시트 배치: 1행 5칸(삼각형·사각형·원형·오각형·육각형) · 2행 5칸(칠각형·팔각형·구각형·십각형·십일각형) ·
3행 4칸(12·13·14·15각형). 칸마다 그림 아래에 이름·분류·설명 글이 붙어 있으므로
**키가 큰 가로 띠만 그림 줄로 보고**, 글 줄은 버린다.

검은 배경이라 가장 밝은 채널을 알파로 삼아(black→alpha) 네온 빛만 남긴다 — survive-obstacles 와 같은 방법.
잘라낸 그림은 빛까지 포함한 딱 맞는 사각형이고, `games/survive/engine/assets.ts` 의 `MOB_ART`
(몸통 비율·중심)이 그 기준으로 맞춰져 있다.

실행: python scripts/slice-survive-mobs.py [시트.webp]
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/assets/survive-mobs"
ROWS = [
    ["tri", "square", "circle", "penta", "hexa"],
    ["hepta", "octa", "nona", "deca", "hendeca"],
    ["dodeca", "trideca", "tetradeca", "chrono"],
]
PAD = 4
MAX = 256  # 게임에서 24~120px 로 그린다 (고해상도 여유)
CUT = 10  # 이 값 이하의 밝기는 배경 (알파용)
FIND = 40  # 칸을 찾을 때 쓰는 밝기 — 은은한 글로우까지 세면 그림 줄과 글씨 줄이 붙어버린다
ART_MIN_H = 100  # 이보다 낮은 가로 띠는 글씨 줄
GAP = 14  # 이보다 좁은 가로 틈은 같은 칸 (네온 장식이 끊겨 보이는 것을 잇는다)
ROW_GAP = 1  # 그림 줄과 바로 아래 이름 글씨는 몇 px 만 떨어져 있다 (붙이지 않는다)


def spans(on: np.ndarray, min_len: int, gap: int) -> list[list[int]]:
    out: list[list[int]] = []
    start = None
    for i, v in enumerate(on):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append([start, i])
            start = None
    if start is not None:
        out.append([start, len(on)])
    out = [s for s in out if s[1] - s[0] >= 4]  # 점 하나짜리 띠가 칸을 이어붙이지 않게
    merged: list[list[int]] = []
    for s in out:
        if merged and s[0] - merged[-1][1] < gap:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    return [s for s in merged if s[1] - s[0] >= min_len]


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "scripts/src/survive-mobs.webp"
    sheet = np.asarray(Image.open(src).convert("RGB")).astype(np.int16)
    a = sheet.max(axis=2)
    alpha = np.clip((a - CUT) * (255 / (255 - CUT)), 0, 255).astype(np.uint8)
    img = Image.fromarray(np.dstack([sheet.astype(np.uint8), alpha]), "RGBA")
    on = a > FIND

    bands = spans(on.sum(axis=1) > 3, ART_MIN_H, ROW_GAP)
    assert len(bands) == len(ROWS), f"그림 줄 {len(bands)}개를 찾았다 (기대 {len(ROWS)})"

    OUT.mkdir(parents=True, exist_ok=True)
    for (y0, y1), names in zip(bands, ROWS):
        cols = spans(on[y0:y1].sum(axis=0) > 2, 24, GAP)
        assert len(cols) == len(names), f"{y0}~{y1} 줄에서 {len(cols)}칸을 찾았다 (기대 {len(names)})"
        # 칸 아래 이름 글씨는 그림과 붙어 보이는 칸이 많다 — **줄 안에서 틈이 보이는 칸**으로
        # 글씨가 시작하는 높이를 찾아 그 줄 전체를 같은 높이에서 자른다.
        inner = [spans(on[y0:y1, x0:x1].sum(axis=1) > 2, 10, 1) for x0, x1 in cols]
        gaps = [sp[0][1] for sp in inner if len(sp) > 1]
        cut = min(gaps) if gaps else y1 - y0

        for (x0, x1), name in zip(cols, names):
            top = next((sp[0][0] for sp in [spans(on[y0:y1, x0:x1].sum(axis=1) > 2, 10, 1)] if sp), 0)
            box = (
                max(0, x0 - PAD),
                max(0, y0 + top - PAD),
                min(img.width, x1 + PAD),
                min(img.height, y0 + cut + PAD),
            )
            piece = img.crop(box)
            if max(piece.size) > MAX:
                k = MAX / max(piece.size)
                piece = piece.resize((round(piece.width * k), round(piece.height * k)), Image.LANCZOS)
            out = OUT / f"{name}.webp"
            piece.save(out, "WEBP", quality=88, method=6)
            print(out.name, piece.size, out.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
