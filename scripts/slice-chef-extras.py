"""
아울 레스토랑 두 번째 리소스 시트(사용자 제공, 1536×1024 RGB · 체크무늬 배경 · 짙은 외곽선 스티커 스타일)
→ public/assets/chef/{cust,bug,ui,badge,decor}/*.webp

    python scripts/slice-chef-extras.py <시트 경로>

- 손님 8명(+ 얼굴 하나씩) · 버그 4종 · UI 아이콘 14 · 연출 배지 12 · 장식 요소 22 를 자른다 (DECISIONS §5-23-2).
- 체크무늬는 그림에 박혀 있다 → 아울러닝 캐릭터 시트와 같은 방법(`slice-owlrun-character.py` 의 `cut`)으로 지운다:
  칸 가장자리에서 이어진 밝은 무채색 = 배경, 외곽선 바깥 1~2px 는 배경색을 빼서 알파를 만든다, 라벨 글자·옆 칸 조각은 버린다.
- 손님 얼굴은 한 사람당 4개지만 표정 차이가 거의 없어서 첫 번째 하나만 쓴다 (티켓의 작은 얼굴).
원본 시트는 레포에 넣지 않는다 (CREDITS.md).
"""

import os
import sys
from importlib import import_module

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
cut = import_module("slice-owlrun-character").cut  # 체크무늬 배경 지우기 (같은 방식)

SHEET = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "chef")

# (x0, y0, x1, y1) — 섹션 제목·라벨 글자 위/옆에서 끊는다
BOXES = {
    "cust": {
        # 손님 8명: 학생 · 개발자 · 여학생 · 해커 · 요리사 · 부엉이 · 게이머 · 고양이 귀
        "c1": (12, 50, 181, 254),
        "c2": (207, 49, 361, 254),
        "c3": (383, 42, 574, 254),
        "c4": (593, 38, 757, 254),
        "c5": (778, 24, 935, 254),
        "c6": (965, 40, 1122, 254),
        "c7": (1159, 41, 1309, 254),
        "c8": (1344, 40, 1513, 254),
        "f1": (13, 253, 61, 303),
        "f2": (208, 253, 254, 303),
        "f3": (386, 253, 434, 303),
        "f4": (578, 253, 630, 303),
        "f5": (776, 252, 821, 303),
        "f6": (965, 255, 1011, 303),
        "f7": (1151, 252, 1208, 303),
        "f8": (1339, 253, 1390, 303),
    },
    "bug": {
        "green": (40, 352, 236, 494),
        "red": (283, 332, 477, 496),
        "blue": (510, 334, 757, 498),
        "gold": (800, 328, 1052, 496),
    },
    "ui": {
        "heart": (6, 540, 100, 628),
        "timer": (108, 526, 206, 628),
        "star": (216, 526, 318, 628),
        "combo": (324, 512, 452, 628),
        "order": (460, 524, 557, 628),
        "coin": (565, 528, 663, 628),
        "play": (669, 530, 769, 628),
        "gear": (773, 528, 871, 628),
        "home": (879, 524, 975, 628),
        "cancel": (977, 526, 1081, 628),
        "ok": (1085, 526, 1189, 628),
        "warn": (1197, 522, 1306, 628),
        "bugwarn": (1307, 526, 1402, 628),
        "skull": (1402, 518, 1524, 628),
    },
    "badge": {
        "new": (22, 695, 115, 765),
        "combo-bonus": (122, 688, 208, 765),
        "fast": (222, 685, 308, 765),
        "multi": (314, 684, 397, 765),
        "done": (411, 688, 485, 765),
        "time-low": (500, 690, 583, 765),
        "time-out": (596, 686, 701, 766),
        "bug-alert": (704, 688, 785, 765),
        "infinite": (789, 688, 926, 766),
        "bubble-order": (933, 679, 1102, 776),
        "bubble-time": (1103, 677, 1315, 770),
        "gameover": (1316, 676, 1528, 773),
    },
    "decor": {
        "sign": (15, 826, 176, 929),
        "menu-board": (186, 808, 316, 932),
        "hello": (318, 812, 426, 906),
        "computer": (419, 806, 562, 928),
        "server": (562, 802, 660, 927),
        "chair": (661, 810, 764, 928),
        "plant": (767, 802, 843, 912),
        "lamps": (840, 795, 956, 882),
        "counter": (961, 790, 1131, 903),
        "window": (1130, 797, 1290, 900),
        "neon": (1300, 797, 1412, 895),
        "banner": (1428, 783, 1525, 980),
        "table": (22, 922, 250, 1019),
        "rug": (244, 940, 428, 1012),
        "trash": (433, 928, 503, 1013),
        "code-board": (506, 925, 737, 1013),
        "plant-shelf": (748, 906, 835, 994),
        "cabinet": (834, 893, 976, 1014),
        "rack": (989, 910, 1097, 1013),
        "sofa": (1100, 904, 1278, 1019),
        "flags": (1273, 904, 1417, 999),
    },
}


def main():
    sheet = Image.open(SHEET).convert("RGB")
    assert sheet.size == (1536, 1024), f"sheet size mismatch: {sheet.size}"
    total = 0
    count = 0
    for folder, table in BOXES.items():
        os.makedirs(os.path.join(OUT, folder), exist_ok=True)
        for name, box in table.items():
            img = cut(sheet, box)
            path = os.path.join(OUT, folder, f"{name}.webp")
            img.save(path, "WEBP", quality=88, alpha_quality=100, method=6)
            total += os.path.getsize(path)
            count += 1
            print(f"{folder}/{name}: {img.size}")
    print(f"saved {count} files ({total // 1024} KB)")


if __name__ == "__main__":
    main()
