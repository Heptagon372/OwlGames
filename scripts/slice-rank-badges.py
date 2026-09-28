"""랭크 뱃지 시트(사용자 제공, 30종) → public/assets/ranks/rank-00.webp … rank-29.webp

시트는 1500×500 투명 PNG(webp)이고 3줄 × 10칸, 칸마다 뱃지 + 아래 이름표("1. 나무")가 있다.
이름표는 화면이 글자로 그리므로 **뱃지만** 자른다 — 이름표 윗변(줄마다 BOTTOM)에서 끊는다.

**그림은 시트 그대로 둔다** (사용자: "준 사진대로 유지"). 알파를 깎아 "얇아진" v1 자르기는 되돌렸다.
시트에는 칸마다 옅은 흰 안개(알파 0~0.25)가 뱃지 **밑에** 한 겹 깔려 있어서, 어두운 화면에서는 회색 네모로 보인다.
그래서 알파를 깎지 않고 그 한 겹만 **거꾸로 합성해서 뺀다** (un-over):
  a = a_b + h(1 − a_b)  →  a_b = (a − h) / (1 − h)
  C·a = C_b·a_b + C_h·h(1 − a_b)  →  C_b = (C·a − C_h·h(1 − a_b)) / a_b
h·C_h 는 칸 네 모서리(뱃지가 없는 곳)에서 잰다. 불투명한 몸통·날개(a≈1)는 값이 그대로고,
색 발광은 색을 유지한 채 흰 안개 몫만 빠진다. 칸 끝까지 번진 옅은 후광만 타원으로 흐려서 네모 자국을 없앤다.
순서는 lib/rank.ts 의 RANKS 순서(시트 번호 − 1)와 같다.
실행: python scripts/slice-rank-badges.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/src/rank-sheet.webp"
OUT = ROOT / "public/assets/ranks"

COLS, ROWS = 10, 3
COL_W = 150
# 줄마다 뱃지 위·아래 (아래 = 이름표 윗변 — 알파 세로 분포의 골)
TOP = [18, 178, 330]
BOTTOM = [131, 292, 444]

# 출력 칸 (정사각, 발광 여백 포함). RankBadge.tsx 의 ART_SCALE 과 맞물린다
CELL = 150
EDGE = 3  # 칸 네 변을 지우는 폭 (px)
HAZE_MAX = 0.3  # 모서리 안개가 이보다 짙게 재지면 뱃지 발광을 잰 것 — 여기서 자른다
SOFT, SOLID = 0.25, 0.6  # 알파가 SOLID 이상이면 그림 그대로, SOFT 이하면 후광으로 보고 가장자리에서 흐린다
HALO_FADE = 0.35  # 타원 가장자리에서 후광이 사라지는 폭 (반지름 비율)


def clean(crop: np.ndarray) -> np.ndarray:
    f = crop.astype(np.float64) / 255.0
    c, a = f[..., :3], f[..., 3]
    h_, w_ = a.shape
    k = 10
    corners = [f[:k, :k], f[:k, -k:], f[-k:, :k], f[-k:, -k:]]
    # 가장 옅은 모서리 = 안개만 있는 곳
    q = min(corners, key=lambda q: float(np.median(q[..., 3])))
    h = min(HAZE_MAX, float(np.median(q[..., 3])))
    ch = q[..., :3].reshape(-1, 3).mean(0) if h > 0.01 else np.ones(3)
    ab = np.clip((a - h) / (1 - h), 0, 1)
    num = c * a[..., None] - ch[None, None, :] * h * (1 - ab)[..., None]
    cb = np.where(ab[..., None] > 1e-3, num / np.maximum(ab, 1e-3)[..., None], 0)
    cb = np.clip(cb, 0, 1)
    x, y = np.arange(w_), np.arange(h_)
    # 흰 후광이 칸 끝에서 직선으로 잘리지 않게 타원으로 서서히 — 옅은 픽셀만(몸통 a ≥ SOLID 는 그대로)
    rx = (x[None, :] - (w_ - 1) / 2) / (w_ / 2)
    ry = (y[:, None] - (h_ - 1) / 2) / (h_ / 2)
    fade = np.clip((1.0 - np.sqrt(rx * rx + ry * ry)) / HALO_FADE + 0.35, 0, 1)
    keep = np.clip((a - SOFT) / (SOLID - SOFT), 0, 1)
    ab = ab * (keep + (1 - keep) * fade)
    ab = ab * np.clip(np.minimum(x, x[::-1]) / EDGE, 0, 1)[None, :]
    ab = ab * np.clip(np.minimum(y, y[::-1]) / EDGE, 0, 1)[:, None]
    return (np.dstack([cb, ab]) * 255 + 0.5).astype(np.uint8)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sheet = np.asarray(Image.open(SRC).convert("RGBA"))
    assert sheet.shape[:2] == (500, 1500), sheet.shape
    n = 0
    for r in range(ROWS):
        for c in range(COLS):
            crop = sheet[TOP[r] : BOTTOM[r], c * COL_W : (c + 1) * COL_W]
            art = Image.fromarray(clean(crop), "RGBA")
            cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            cell.alpha_composite(art, ((CELL - art.width) // 2, (CELL - art.height) // 2))
            cell.save(OUT / f"rank-{n:02d}.webp", "WEBP", lossless=True, method=6)
            n += 1
    assert n == 30, n
    print(f"{n} -> {OUT}")


if __name__ == "__main__":
    main()
