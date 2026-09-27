"""
아울러닝 캐릭터 시트(사용자 제공, 1774×887 RGB · 체크무늬 배경 · 짙은 외곽선 스티커 스타일)
→ public/assets/owlrun/char/*.webp

    python scripts/slice-owlrun-character.py <시트 경로>

- 체크무늬(밝은 회색·흰색)는 그림에 박혀 있다 → **칸 가장자리에서 이어진 밝은 무채색**만 배경으로 지운다.
  외곽선 안의 흰 배·눈 하이라이트는 외곽선에 막혀 이어지지 않으므로 남는다.
- 외곽선 바깥 1~2px 는 배경과 섞인 색이라, 배경색을 빼서 알파를 만든다 → 어두운 하늘에서 흰 테두리가 남지 않는다.
- 라벨 글자(그림 아래)·옆 칸 조각은 지운다.
- 게임에서는 부엉이가 논리 57px × 화면 배율(최대 4배)로 그려진다 → **Lanczos 2배 + 약한 언샤프**로 미리 키운다 (브라우저는 줄이기만).
- 날갯짓·활공 프레임(70px)은 쓰지 않는다 — 큰 색별 그림에 날갯짓을 코드로 입힌다 (engine/sprites.ts).
"""

import os
import sys
from importlib import import_module

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
label = import_module("slice-owlrun-sheet").label  # 같은 union-find 라벨러

SHEET = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "owlrun", "char")

# (x0, y0, x1, y1) — 그림 + 둘레 장식(별·하트·소용돌이)이 들어가는 칸. 라벨 글자 위에서 끊는다
BOXES = {
    "hero": (8, 90, 258, 344),
    "R": (1308, 88, 1440, 220),
    "B": (1464, 88, 1596, 220),
    "P": (1618, 88, 1746, 220),
    "trail-R": (1306, 310, 1460, 404),
    "trail-B": (1462, 310, 1606, 406),
    "trail-P": (1612, 310, 1750, 406),
    "phantom": (498, 471, 643, 612),
    "freeze": (668, 476, 816, 612),
    "fire": (838, 479, 982, 612),
    "golden": (1007, 477, 1155, 612),
    "fx-energy": (1222, 486, 1372, 612),
    "fx-score": (1398, 486, 1535, 612),
    "fx-turbo": (1580, 490, 1742, 612),
    "hit": (35, 716, 150, 830),
    "fall": (184, 716, 294, 822),
    "dead": (328, 716, 436, 822),
    "revive": (462, 716, 592, 826),
    "idle": (650, 716, 762, 830),
    "dizzy": (808, 712, 940, 832),
    "happy": (994, 712, 1140, 832),
    "victory": (1598, 708, 1735, 830),
}


def is_light(a):
    mx, mn = a[..., :3].max(axis=2), a[..., :3].min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1)
    return (mn > 222) & (sat < 0.1)


def cut(sheet, box):
    a = np.asarray(sheet.crop(box).convert("RGB")).astype(np.float32)
    h, w, _ = a.shape
    # 1) 가장자리에서 이어진 밝은 무채색 = 배경
    light = is_light(a)
    lab, _ = label(light)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])).tolist()) - {0}
    bg = np.isin(lab, list(edge))
    fg = ~bg

    # 2) 전경 덩어리 정리 — 가장 큰 덩어리(몸) + 둘레 장식. 몸 아래로 떨어진 라벨·가장자리 조각은 버린다
    lab, areas = label(fg)
    keep = np.zeros((h, w), bool)
    if areas:
        biggest = max(areas, key=areas.get)
        ys = np.where((lab == biggest).any(axis=1))[0]
        body_bottom = ys.max()
        border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])).tolist())
        mx, mn = a.max(axis=2), a.min(axis=2)
        sat = (mx - mn) / np.maximum(mx, 1)
        for lid, area in areas.items():
            m = lab == lid
            if lid == biggest:
                keep |= m
                continue
            top = np.where(m.any(axis=1))[0].min()
            dark_grey = (sat[m].mean() < 0.2) and (a[m].mean() < 140)  # 라벨 글자 (짙은 남색·회색)
            if lid not in border and top < body_bottom - 4 and area >= 12 and not dark_grey:
                keep |= m

    # 3) 가장자리 알파 — 배경 쪽 2px 띠는 배경색과 섞인 색이라 배경을 빼서 알파를 만든다
    bgc = np.median(a[bg], axis=0) if bg.any() else np.array([248, 248, 248], np.float32)
    alpha = keep.astype(np.float32)
    near_bg = np.asarray(Image.fromarray((bg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 127
    band = keep & near_bg
    dist = np.abs(a - bgc).max(axis=2)  # 외곽선은 짙어서 거의 1
    alpha = np.where(band, np.clip(dist / 150, 0, 1), alpha)
    safe = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.where(band[..., None], np.clip(bgc + (a - bgc) / safe, 0, 255), a)
    out = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), "RGBA")
    bbox = out.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox:
        x0, y0, x1, y1 = bbox
        out = out.crop((max(0, x0 - 3), max(0, y0 - 3), min(w, x1 + 3), min(h, y1 + 3)))
    return out


def upscale(img, k=2):
    """Lanczos 2배 + 언샤프 — 알파를 곱한 상태로 키워 가장자리 번짐을 막는다"""
    a = np.asarray(img).astype(np.float32) / 255
    rgb, al = a[..., :3], a[..., 3:4]
    pre = Image.fromarray((np.dstack([rgb * al, al[..., 0]]) * 255).astype(np.uint8), "RGBA")
    big = pre.resize((img.width * k, img.height * k), Image.LANCZOS)
    b = np.asarray(big).astype(np.float32) / 255
    bal = b[..., 3:4]
    brgb = np.where(bal > 1e-3, b[..., :3] / np.maximum(bal, 1e-3), 0)
    sharp = Image.fromarray((brgb.clip(0, 1) * 255).astype(np.uint8), "RGB").filter(
        ImageFilter.UnsharpMask(radius=1.4, percent=60, threshold=2)
    )
    return Image.merge("RGBA", (*sharp.split(), Image.fromarray((bal[..., 0].clip(0, 1) * 255).astype(np.uint8))))


def main():
    os.makedirs(OUT, exist_ok=True)
    sheet = Image.open(SHEET).convert("RGB")
    assert sheet.size == (1774, 887), f"sheet size mismatch: {sheet.size}"
    total = 0
    for name, box in BOXES.items():
        img = cut(sheet, box)
        out = img if name == "hero" else upscale(img)
        path = os.path.join(OUT, f"{name}.webp")
        out.save(path, "WEBP", quality=92, method=6)
        total += os.path.getsize(path)
        print(f"{name:10s} {img.width}x{img.height} -> {out.width}x{out.height}")
    print(f"saved {len(BOXES)} files ({total // 1024} KB)")


if __name__ == "__main__":
    main()
