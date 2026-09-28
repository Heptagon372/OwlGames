"""조작 안내 손가락(사용자 제공, 투명 배경) → public/assets/ui/coach-hand.webp

여백을 잘라 내고 작게 줄인다. 손끝(= 링 가운데)이 그림의 어디인지는 games/core/coach.tsx 의 TIP_X·TIP_Y 와 같아야 한다.
실행: python scripts/slice-coach-hand.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/src/coach-hand.webp"
OUT = ROOT / "public/assets/ui/coach-hand.webp"

# 원본(1254²)에서 발광까지 담는 칸과 누르는 점(링 가운데)
BOX = (205, 175, 995, 1175)
TIP = (587, 450)
WIDTH = 240

im = Image.open(SRC).convert("RGBA").crop(BOX)
h = round(im.height * WIDTH / im.width)
im = im.resize((WIDTH, h), Image.LANCZOS)
OUT.parent.mkdir(parents=True, exist_ok=True)
im.save(OUT, "WEBP", quality=90, method=6)
tx = (TIP[0] - BOX[0]) / (BOX[2] - BOX[0])
ty = (TIP[1] - BOX[1]) / (BOX[3] - BOX[1])
print(f"{OUT.name} {WIDTH}x{h}  TIP_X={tx:.3f} TIP_Y={ty:.3f}")
