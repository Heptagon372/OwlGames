"""
아울러닝 리소스 시트(사용자 제공, 1312×1199 RGB) → public/assets/owlrun/*.webp

    python scripts/slice-owlrun-sheet.py <시트 경로>

- 스프라이트: 짙은 남색 패널 배경을 빼서 투명하게 만든다.
  알파 = 테두리 배경색과의 거리, 색은 배경을 빼고 되살린다(un-premultiply) → 네온 빛이 다른 바탕에서도 같은 색으로 번진다.
  눈동자처럼 전경에 둘러싸인 작은 구멍은 불투명하게 채우고, 자른 칸 가장자리에 걸친 이웃 조각은 지운다.
- 부엉이 캐릭터는 여기서 자르지 않는다 — 두 번째 캐릭터 시트를 `slice-owlrun-character.py` 가 고해상도로 자른다.
- 카드(이벤트 연출 · 단계 배경)는 사각형 그대로 자른다. 단계 배경은 먼 하늘로 쓰려고 키우고 살짝 흐린다.
원본 시트는 레포에 넣지 않는다 (CREDITS.md).
"""

import os
import sys

import numpy as np
from PIL import Image, ImageFilter

SHEET = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "owlrun")

SPRITES = {
    "logo": (14, 8, 206, 70),
    "color-R": (830, 112, 908, 192),
    "color-B": (916, 110, 1004, 192),
    "color-P": (1008, 112, 1092, 192),
    "text-perfect": (1142, 108, 1275, 172),
    "text-near": (1134, 170, 1280, 224),
    "text-combo": (1132, 221, 1222, 278),
    "text-fever": (1138, 279, 1278, 338),
    "wall-block": (35, 397, 114, 485),
    "wall-slab": (127, 397, 218, 427),
    "wall-narrow": (237, 396, 291, 486),
    "wall-moving": (312, 408, 416, 470),
    "spikes": (426, 406, 491, 473),
    "missile": (319, 555, 387, 606),
    "saw": (419, 546, 491, 618),
    "wave-zone": (529, 394, 618, 447),
    "glitch-block": (644, 392, 727, 449),
    "gate-fake": (647, 486, 731, 556),
    "turbo-arrows": (532, 603, 619, 669),
    "item-energy": (902, 396, 958, 452),
    "item-crystal": (1002, 389, 1068, 456),
    "item-rage": (1114, 394, 1169, 455),
    "item-shield": (1215, 391, 1273, 456),
    "item-feather": (898, 497, 962, 561),
    "item-star": (1004, 499, 1062, 557),
    "item-magnet": (1108, 498, 1172, 559),
    "item-phantom": (1212, 495, 1278, 562),
    "item-golden": (900, 605, 961, 667),
    "item-owl-energy": (995, 602, 1069, 671),
    "item-size-S": (1094, 612, 1128, 660),
    "item-size-L": (1160, 612, 1196, 660),
    "item-box": (1218, 607, 1275, 666),
    "deco-cloud": (864, 1090, 915, 1135),
    "deco-moon": (964, 1090, 1006, 1135),
}

CARDS = {
    "ev-laser": (31, 768, 141, 877),
    "ev-quake": (153, 768, 270, 877),
    "ev-gravity": (281, 768, 394, 877),
    "ev-storm": (404, 768, 517, 877),
    "ev-feather": (528, 768, 642, 877),
    "ev-golden": (657, 768, 768, 877),
    "ev-turbo": (31, 921, 139, 1002),
    "ev-phantom": (153, 921, 268, 1002),
    "ev-chain": (281, 921, 394, 1002),
    "ev-chaos": (404, 921, 517, 1002),
    "ev-items": (529, 921, 642, 1002),
    "ev-missile": (656, 921, 764, 1002),
}

BACKDROPS = {
    "bg-01": (30, 1080, 179, 1149),
    "bg-05": (196, 1081, 352, 1150),
    "bg-10": (365, 1079, 516, 1150),
    "bg-14": (528, 1079, 678, 1150),
    "bg-15": (691, 1079, 833, 1149),
}


def label(mask):
    """8-연결 라벨 (scipy 없이 런 기반 union-find). 반환: 라벨 배열, 라벨→면적"""
    H, W = mask.shape
    parent = [0]

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    lab = np.zeros((H, W), np.int32)
    prev = []
    for y in range(H):
        row = mask[y].astype(np.int8)
        d = np.diff(np.concatenate(([0], row, [0])))
        starts, ends = np.where(d == 1)[0], np.where(d == -1)[0]
        cur = []
        j = 0
        for s, e in zip(starts, ends):
            n = len(parent)
            parent.append(n)
            while j < len(prev) and prev[j][1] < s - 1:
                j += 1
            k = j
            while k < len(prev) and prev[k][0] <= e:
                a, b = find(prev[k][2]), find(n)
                if a != b:
                    parent[a] = b
                k += 1
            cur.append((s, e, n))
            lab[y, s:e] = n
        prev = cur
    roots = np.array([find(i) for i in range(len(parent))], np.int32)
    lab = roots[lab]
    ids, counts = np.unique(lab[lab > 0], return_counts=True)
    return lab, dict(zip(ids.tolist(), counts.tolist()))


def dilate(mask, r):
    img = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(r * 2 + 1))
    return np.asarray(img) > 127


def cut_sprite(sheet, box):
    a = np.asarray(sheet.crop(box).convert("RGB")).astype(np.float32)
    H, W, _ = a.shape
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    diff = np.abs(a - bg).max(axis=2)
    alpha = np.clip((diff - 12) / 58, 0, 1)

    # 전경에 둘러싸인 작은 구멍(눈동자·어두운 외곽선)은 불투명
    strong = alpha > 0.55
    lab, areas = label(~strong)
    edge_ids = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])).tolist())
    for lid, area in areas.items():
        if lid not in edge_ids and area < 0.03 * H * W:
            alpha[lab == lid] = 1.0

    # 칸 가장자리에 걸친 이웃 조각 지우기 (가장 큰 덩어리는 남긴다)
    lab, areas = label(alpha > 0.2)
    if areas:
        biggest = max(areas, key=areas.get)
        edge_ids = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])).tolist())
        keep = np.zeros((H, W), bool)
        for lid, area in areas.items():
            if lid == biggest or lid not in edge_ids:
                keep |= lab == lid
        near = dilate(keep, 5)
        alpha = np.where(near, alpha, 0)

    # 배경을 빼고 색 되살리기 (a=1 이면 원래 색)
    safe = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.clip(bg + (a - bg) / safe, 0, 255)
    rgb = np.where(alpha[..., None] > 0.999, a, rgb)
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(out, "RGBA")
    bbox = img.getchannel("A").point(lambda v: 255 if v > 6 else 0).getbbox()
    if bbox:
        x0, y0, x1, y1 = bbox
        img = img.crop((max(0, x0 - 2), max(0, y0 - 2), min(W, x1 + 2), min(H, y1 + 2)))
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    sheet = Image.open(SHEET).convert("RGB")
    assert sheet.size == (1312, 1199), f"시트 크기가 다릅니다: {sheet.size}"

    cut = {name: cut_sprite(sheet, box) for name, box in SPRITES.items()}

    # 부엉이 몸·날갯짓·색 꼬리는 캐릭터 시트(slice-owlrun-character.py)가 고해상도로 대신한다

    for name, img in cut.items():
        img.save(os.path.join(OUT, f"{name}.webp"), "WEBP", quality=92, method=6)

    for name, box in CARDS.items():
        sheet.crop(box).save(os.path.join(OUT, f"{name}.webp"), "WEBP", quality=88, method=6)

    for name, box in BACKDROPS.items():
        img = sheet.crop(box).resize((640, 300), Image.LANCZOS).filter(ImageFilter.GaussianBlur(2.2))
        img.save(os.path.join(OUT, f"{name}.webp"), "WEBP", quality=82, method=6)

    print("saved", len(cut) + len(CARDS) + len(BACKDROPS), "files →", os.path.abspath(OUT))


if __name__ == "__main__":
    main()
