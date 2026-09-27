"""게임 로고 시트(사용자 제공, 투명 PNG 2×2) → public/assets/logos/<game>.webp

시트 배치: 좌상 서바이버즈 · 우상 아울러닝 · 좌하 레스토랑 · 우하 아울리스.
칸마다 알파가 있는 영역만 잘라 여백 8px 을 두고 저장한다.
실행: python scripts/slice-game-logos.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/src/game-logos.webp"
OUT = ROOT / "public/assets/logos"
PAD = 8
MAX_W = 640  # 카드·인트로에서 최대 320px 정도로 쓴다 (2배)

CELLS = {"survive": (0, 0), "flight": (1, 0), "chef": (0, 1), "owlis": (1, 1)}


def main() -> None:
    sheet = Image.open(SRC).convert("RGBA")
    w, h = sheet.width // 2, sheet.height // 2
    OUT.mkdir(parents=True, exist_ok=True)
    for game, (cx, cy) in CELLS.items():
        cell = sheet.crop((cx * w, cy * h, (cx + 1) * w, (cy + 1) * h))
        alpha = np.asarray(cell)[..., 3]
        ys, xs = np.where(alpha > 8)
        box = (
            max(0, xs.min() - PAD),
            max(0, ys.min() - PAD),
            min(w, xs.max() + 1 + PAD),
            min(h, ys.max() + 1 + PAD),
        )
        logo = cell.crop(box)
        if logo.width > MAX_W:
            logo = logo.resize((MAX_W, round(logo.height * MAX_W / logo.width)), Image.LANCZOS)
        logo.save(OUT / f"{game}.webp", "WEBP", quality=90, method=6)
        print(game, logo.size)


if __name__ == "__main__":
    main()
