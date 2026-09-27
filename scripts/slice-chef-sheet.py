"""
아울 레스토랑 리소스 시트(사용자 제공, 1125×1028 RGBA · 투명 배경) → public/assets/chef/{food,item,tool}/*.webp

    python scripts/slice-chef-sheet.py <시트 경로>

- 시트 가운데 **음식 25종 · 재료 · 주방 도구**만 자른다 (손님·버그·UI 아이콘·배경은 쓰지 않는다 — DECISIONS §5-23-1).
- 배경이 이미 투명해서 색을 빼지 않는다. 칸마다 가장 큰 덩어리(= 그림)를 찾고, 그것과 겹치는 조각(뱃지·깃발·김)만 남긴다.
  그림 아래의 한글 이름표와 옆 칸 조각은 지운다.
- 재료는 게임의 22종에 맞는 것만 (시트 이름 → 게임 id). 딸기는 시트에 없어서 이모지로 남는다.
원본 시트는 레포에 넣지 않는다 (CREDITS.md).
"""

import os
import sys
from collections import deque

import numpy as np
from PIL import Image

SHEET = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "chef")

# (x0, y0, x1, y1) — 넉넉히 잡은 칸. 이름표 윗줄보다 위에서 끊는다.
R1, R2, R3 = (26, 127), (142, 239), (258, 352)
FOOD = {
    "hotdog": (10, R1[0], 114, R1[1]),
    "burger": (124, R1[0], 221, R1[1]),
    "fries": (236, R1[0], 327, R1[1]),
    "salad": (336, R1[0], 447, R1[1]),
    "toast": (457, R1[0], 560, R1[1]),
    "sandwich": (573, R1[0], 674, R1[1]),
    "ramen": (682, R1[0], 785, R1[1]),
    "wings": (791, R1[0], 899, R1[1]),
    "pancake": (906, R1[0], 1007, R1[1]),
    "cake": (1017, R1[0], 1116, R1[1]),
    "steak": (7, R2[0], 116, R2[1]),
    "pizza": (119, R2[0], 227, R2[1]),
    "spaghetti": (230, R2[0], 338, R2[1]),
    "icecream": (351, R2[0], 438, R2[1]),
    "taco": (457, R2[0], 562, R2[1]),
    "donburi": (566, R2[0], 679, R2[1]),
    "gitpasta": (683, R2[0], 797, R2[1]),
    "omelet": (798, R2[0], 908, R2[1]),
    "gimbap": (911, R2[0], 1014, R2[1]),
    "chicken": (1023, R2[0], 1113, R2[1]),
    "sushi": (10, R3[0], 123, R3[1]),
    "curry": (130, R3[0], 247, R3[1]),
    "hotpot": (258, R3[0], 390, R3[1]),
    "lasagna": (399, R3[0], 506, R3[1]),
    "fullstack": (514, R3[0], 656, R3[1]),
}

# 게임 재료 id ← 시트 칸
IA, IB, IC, ID, IE = (400, 453), (466, 523), (536, 588), (598, 659), (672, 732)
ITEM = {
    "meat": (13, IA[0], 79, IA[1]),  # 소고기
    "patty": (89, IA[0], 162, IA[1]),  # 돼지고기 (다진 고기 패티로 쓴다)
    "chicken": (171, IA[0], 237, IA[1]),  # 닭고기
    "ham": (244, IA[0], 312, IA[1]),  # 베이컨
    "sausage": (320, IA[0], 386, IA[1]),  # 소시지
    "fish": (403, IA[0], 476, IA[1]),  # 생선
    "lettuce": (9, IB[0], 73, IB[1]),  # 상추
    "tomato": (80, IB[0], 142, IB[1]),  # 토마토
    "onion": (150, IB[0], 204, IB[1]),  # 양파
    "potato": (213, IB[0], 271, IB[1]),  # 감자
    "bun": (9, IC[0], 77, IC[1]),  # 빵
    "noodle": (148, IC[0], 213, IC[1]),  # 면
    "rice": (216, IC[0], 273, IC[1]),  # 쌀
    "egg": (279, IC[0], 325, IC[1]),  # 계란
    "cheese": (334, IC[0], 392, IC[1]),  # 치즈
    "seaweed": (398, IC[0], 461, IC[1]),  # 김
    "batter": (11, ID[0], 71, ID[1]),  # 밀가루
    "cream": (210, ID[0], 260, ID[1]),  # 마요네즈 (흰 크림 병)
    "sauce": (333, ID[0], 382, ID[1]),  # 토마토소스
    "syrup": (477, ID[0], 524, ID[1]),  # 시럽
    "spice": (24, IE[0], 64, IE[1]),  # 소금
}

T1, T2, T3 = (398, 506), (544, 638), (652, 728)
TOOL = {
    "board": (548, T1[0], 657, T1[1]),
    "pan": (666, T1[0], 765, T1[1]),
    "pot": (768, T1[0], 869, T1[1]),
    "oven": (881, T1[0], 984, T1[1]),
    "mixer": (1011, T1[0], 1083, T1[1]),
    # 도구 말고 화면에 쓰는 것 — 접시(패스) · 쓰레기통(비우기) · 트레이(제출)
    "plate": (917, T2[0], 1014, T2[1]),
    "trash": (700, T3[0], 760, T3[1]),
    "tray": (793, T3[0], 943, T3[1]),
}


def components(mask):
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    comps = []
    n = 0
    for y in range(h):
        for x in np.nonzero(mask[y] & (lab[y] == 0))[0]:
            if lab[y, x]:
                continue
            n += 1
            q = deque([(y, x)])
            lab[y, x] = n
            x0 = x1 = x
            y0 = y1 = y
            cnt = 0
            while q:
                cy, cx = q.popleft()
                cnt += 1
                x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        q.append((ny, nx))
            comps.append((n, cnt, x0, y0, x1, y1))
    return lab, comps


def cut(sheet, box):
    x0, y0, x1, y1 = box
    crop = sheet[y0:y1, x0:x1].copy()
    a = crop[..., 3]
    lab, comps = components(a > 8)
    main = max(comps, key=lambda c: c[1])
    _, _, mx0, my0, mx1, my1 = main
    keep = np.zeros_like(a, bool)
    for n, cnt, cx0, cy0, cx1, cy1 in comps:
        # 그림과 겹치는 조각만 (뱃지·깃발 = 위·옆에 붙음, 이름표 = 아래, 옆 칸 = 바깥)
        if cx1 < mx0 - 6 or cx0 > mx1 + 6 or cy1 < my0 - 26 or cy0 > my1 - 2:
            continue
        if cnt < 4:
            continue
        # 칸 윗변에 닿은 조각 = 위쪽 섹션 제목("25가지 음식" · "재료" · "주방 도구")
        if n != main[0] and cy0 == 0:
            continue
        keep |= lab == n
    crop[~keep] = 0
    ys, xs = np.nonzero(crop[..., 3] > 0)
    crop = crop[max(0, ys.min() - 1) : ys.max() + 2, max(0, xs.min() - 1) : xs.max() + 2]
    return Image.fromarray(crop, "RGBA")


def main():
    sheet = np.array(Image.open(SHEET).convert("RGBA"))
    total = 0
    for folder, table in (("food", FOOD), ("item", ITEM), ("tool", TOOL)):
        os.makedirs(os.path.join(OUT, folder), exist_ok=True)
        for name, box in table.items():
            img = cut(sheet, box)
            path = os.path.join(OUT, folder, f"{name}.webp")
            img.save(path, "WEBP", quality=90, alpha_quality=100, method=6)
            total += os.path.getsize(path)
            print(f"{folder}/{name}: {img.size}")
    print(f"합계 {total / 1024:.1f}KB")


if __name__ == "__main__":
    main()
