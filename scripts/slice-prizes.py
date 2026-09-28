"""상품 그림 시트(사용자 제공) → public/assets/prizes/prize-1.webp … prize-6.webp

시트는 1536×1024 RGB 이고 3칸 × 2줄, 순서는 등수 순서(1 PC · 2 마우스 · 3 키보드 · 4 키캡 키링 · 5 과자 · 6 젤리)다.
배경은 투명이 아니라 **체크무늬가 그려져 있다**. 무채색·밝은 픽셀 덩어리 가운데
  - 시트 가장자리에 닿은 것, 또는
  - 닫힌 구멍(키링 고리 안·과자 봉지 틈)이라도 체크무늬 두 색이 섞여 있는 것
을 배경으로 지운다. 스티커 외곽선은 연보라 기운(채도)이 있어 남는다.
그림이 칸 경계를 넘기도 해서(키보드 패드) 고정 칸으로 자르지 않고, 남은 덩어리를 **무게중심이 든 칸**에 붙인다.
출력은 정사각 CELL 칸(가운데 정렬, 여백 PAD). components/PrizeArt.tsx 가 <img> 로 그린다.
실행: python scripts/slice-prizes.py
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/src/prizes.webp"
OUT = ROOT / "public/assets/prizes"

COLS, ROWS = 3, 2
CELL = 320  # 출력 한 변
PAD = 8
GRAY = 10  # 채도(max-min)가 이 이하이고
BRIGHT = 212  # 가장 어두운 채널이 이 이상이면 체크무늬 후보
DARK_TONE = (222, 245)  # 체크무늬의 어두운 칸 밝기 범위 (밝은 칸은 250 이상)
MIN_PIECE = 300  # 이보다 작은 덩어리는 버린다 (지운 뒤 남은 부스러기)

N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))


def label(mask: np.ndarray) -> tuple[np.ndarray, int]:
    """4-이웃 연결 성분 번호 (scipy 없이)"""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    n = 0
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys.tolist(), xs.tolist()):
        if lab[y0, x0]:
            continue
        n += 1
        lab[y0, x0] = n
        q = deque([(y0, x0)])
        while q:
            y, x = q.popleft()
            for dy, dx in N4:
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = n
                    q.append((ny, nx))
    return lab, n


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rgb = np.asarray(Image.open(SRC).convert("RGB"))
    h, w, _ = rgb.shape
    assert (h, w) == (1024, 1536), rgb.shape
    c = rgb.astype(np.int16)
    lo = c.min(2)
    cand = ((c.max(2) - lo) <= GRAY) & (lo >= BRIGHT)

    # 배경 = 가장자리에 닿은 후보 덩어리 + 체크무늬 두 색이 섞인 닫힌 덩어리
    lab, n = label(cand)
    ids = lab.ravel()
    size = np.bincount(ids, minlength=n + 1)
    dark = np.bincount(ids, weights=((lo >= DARK_TONE[0]) & (lo <= DARK_TONE[1])).ravel(), minlength=n + 1)
    edge = np.zeros(n + 1, bool)
    edge[np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))] = True
    frac = dark / np.maximum(size, 1)
    is_bg = edge | ((size >= 300) & (frac > 0.3) & (frac < 0.7))
    is_bg[0] = False
    bg = is_bg[lab]

    # 남은 그림을 덩어리로 나눠 무게중심이 든 칸에 붙인다
    fg, m = label(~bg)
    cw, ch = w // COLS, h // ROWS
    owner = np.zeros(m + 1, np.int32)
    fids = fg.ravel()
    cnt = np.bincount(fids, minlength=m + 1)
    yy, xx = np.indices((h, w))
    cy = np.bincount(fids, weights=yy.ravel(), minlength=m + 1) / np.maximum(cnt, 1)
    cx = np.bincount(fids, weights=xx.ravel(), minlength=m + 1) / np.maximum(cnt, 1)
    for k in range(1, m + 1):
        if cnt[k] >= MIN_PIECE:
            owner[k] = 1 + int(cy[k] // ch) * COLS + int(cx[k] // cw)
    cell_of = owner[fg]

    for i in range(1, COLS * ROWS + 1):
        a = Image.fromarray(np.where(cell_of == i, 255, 0).astype(np.uint8), "L")
        a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
        art = Image.fromarray(np.dstack([rgb, np.asarray(a)]), "RGBA")
        art = art.crop(art.getbbox())
        side = max(art.size)
        sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        sq.paste(art, ((side - art.width) // 2, (side - art.height) // 2))
        inner = CELL - PAD * 2
        sq = sq.resize((inner, inner), Image.LANCZOS)
        out = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        out.paste(sq, (PAD, PAD))
        out.save(OUT / f"prize-{i}.webp", "WEBP", quality=88, method=6)
        print(f"prize-{i}.webp", art.size)


if __name__ == "__main__":
    main()
