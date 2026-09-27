"""아울 서바이버즈 장애물 시트(사용자 제공, 검은 배경 RGB) → public/assets/survive-obstacles/*.webp

시트 배치: 5열 × 2행. 위가 멀쩡한 모습, 아래가 부서진 모습이고
열 순서는 서버랙(파랑 가로) · 배선(자홍 줄무늬) · 박스(파랑 정사각) · 소화기(파랑 기둥) · 포털(자홍 고리).

검은 배경이라 **가장 밝은 채널을 알파로 삼아**(black→alpha) 네온 빛만 남긴다 — survive-mobs 와 같은 방법.
실행: python scripts/slice-survive-obstacles.py <시트.webp>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/assets/survive-obstacles"
COLS = ["rack", "cable", "box", "extinguisher", "portal"]
ROWS = ["", "-broken"]
PAD = 4
MAX = 256  # 게임에서 30~100px 로 그린다 (고해상도 여유)
# 같은 열(멀쩡/부서짐)은 **같은 배율**로 저장한다 — 게임이 부서진 그림을 같은 크기로 겹쳐 그린다
CUT = 10  # 이 값 이하의 밝기는 배경


def spans_of(band: np.ndarray) -> list[tuple[int, int]]:
    """열 경계는 균등 분할이 아니라 **빈 세로줄**로 찾는다 (글로우가 이웃 칸에 잘려 들어가지 않게)"""
    on = band.max(axis=0) > CUT
    out, start = [], None
    for x, v in enumerate(on):
        if v and start is None:
            start = x
        elif not v and start is not None:
            if x - start > 20:
                out.append((start, x))
            start = None
    if start is not None and len(on) - start > 20:
        out.append((start, len(on)))
    return out


def piece_of(img: Image.Image, x0: int, x1: int, y0: int, y1: int) -> Image.Image:
    cell = img.crop((x0, y0, x1, y1))
    ys, xs = np.where(np.asarray(cell)[..., 3] > 6)
    return cell.crop((
        max(0, xs.min() - PAD),
        max(0, ys.min() - PAD),
        min(cell.width, xs.max() + 1 + PAD),
        min(cell.height, ys.max() + 1 + PAD),
    ))


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "scripts/src/survive-obstacles.webp"
    sheet = np.asarray(Image.open(src).convert("RGB")).astype(np.int16)
    a = sheet.max(axis=2)
    # 배경(검정)을 완전 투명으로, 그 위는 부드럽게 올린다 — 글로우가 사각형으로 잘리지 않게
    alpha = np.clip((a - CUT) * (255 / (255 - CUT)), 0, 255).astype(np.uint8)
    img = Image.fromarray(np.dstack([sheet.astype(np.uint8), alpha]), "RGBA")

    ch = img.height // len(ROWS)
    OUT.mkdir(parents=True, exist_ok=True)
    rows = [spans_of(alpha[r * ch : (r + 1) * ch]) for r in range(len(ROWS))]
    for r, sp in enumerate(rows):
        assert len(sp) == len(COLS), f"{r}행에서 {len(sp)}칸을 찾았다 (기대 {len(COLS)})"

    for c, name in enumerate(COLS):
        pieces = [piece_of(img, rows[r][c][0], rows[r][c][1], r * ch, (r + 1) * ch) for r in range(len(ROWS))]
        k = min(1.0, MAX / max(max(p.size) for p in pieces))
        for piece, suffix in zip(pieces, ROWS):
            if k < 1:
                piece = piece.resize((round(piece.width * k), round(piece.height * k)), Image.LANCZOS)
            out = OUT / f"{name}{suffix}.webp"
            piece.save(out, "WEBP", quality=88, method=6)
            print(out.name, piece.size, out.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
