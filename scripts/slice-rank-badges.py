"""랭크 뱃지 시트(사용자 제공) → public/assets/ranks/rank-00.webp … rank-16.webp

v2 시트(14개)가 기본이고, v2 에 없는 3개(아이언·사파이어·마스터)는 v1 시트(17개)에서 가져온다.

시트는 투명 PNG 가 아니라 **체커 무늬가 그림에 박힌 RGB** 라서, 흰색 기준 color-to-alpha 로 배경을 뺀다.
  알파 = max(어두운 정도, 채도)  — 밝은 회색 체커(235~254)는 0, 색 발광은 반투명으로 남는다.
실행: python scripts/slice-rank-badges.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/assets/ranks"

# 출력 칸 (발광 여백 포함). RankBadge.tsx 의 ART_W·ART_H 와 같아야 한다
CELL_W, CELL_H = 132, 216

# v2 시트: 14개, 간격이 고르지 않아 중심을 직접 적는다. (시트 순서 → 랭크 번호)
V2 = {
    "src": ROOT / "scripts/src/rank-sheet.webp",
    "top": 236,
    "half_w": 66,
    "cx": [87, 230, 378, 525, 674, 822, 966, 1108, 1259, 1400, 1535, 1664, 1796, 1924],
    "rank": [0, 1, 3, 4, 5, 6, 7, 8, 9, 11, 13, 14, 15, 16],
}
# v1 시트: 17개 등간격. v2 에 없는 아이언(2)·사파이어(10)·마스터(12)만 여기서 쓴다
V1 = {
    "src": ROOT / "scripts/src/rank-sheet-v1.webp",
    "top": 246,
    "half_w": 62,
    "cx": [round(78 + i * (1920 - 78) / 16) for i in range(17)],
    "rank": [2, 10, 12],
}

EDGE_FADE = 16  # px


def solid_core(a: np.ndarray) -> np.ndarray:
    """알파 0.35 이상 영역의 구멍을 메운 뒤 1px 부드럽게 — 뱃지 몸통 마스크"""
    core = Image.fromarray(((a > 0.35) * 255).astype(np.uint8), "L")
    padded = Image.new("L", (core.width + 2, core.height + 2), 0)
    padded.paste(core, (1, 1))
    ImageDraw.floodfill(padded, (0, 0), 128)  # 바깥(배경)만 128 로 칠해진다
    filled = np.asarray(padded)[1:-1, 1:-1] != 128
    m = Image.fromarray((filled * 255).astype(np.uint8), "L").filter(ImageFilter.MinFilter(3))
    m = m.filter(ImageFilter.GaussianBlur(1.2))
    return np.asarray(m).astype(np.float32) / 255.0


def to_rgba(rgb: np.ndarray) -> np.ndarray:
    c = rgb.astype(np.float32) / 255.0
    mx, mn = c.max(2), c.min(2)
    dark = np.clip((1.0 - mn - 0.10) / 0.90, 0, 1)
    sat = np.clip(((mx - mn) / np.maximum(mx, 1e-4) - 0.06) * 1.6, 0, 1)
    a = np.maximum(dark, sat)
    a = np.where(a < 0.03, 0, a)
    # 은색·흰 하이라이트는 흰 바탕과 구분이 안 돼 투명해진다 → 테두리로 둘러싸인 안쪽은 전부 불투명
    a = np.maximum(a, solid_core(a))
    # 이웃 뱃지 발광이 잘린 자국이 보이지 않게 좌우 끝을 서서히 지운다
    h, w = a.shape
    fade = np.clip(np.minimum(np.arange(w), np.arange(w)[::-1]) / EDGE_FADE, 0, 1)
    a = a * fade[None, :]
    # 흰 바탕에 합성된 색을 되돌린다: C = a·F + (1-a)·1
    f = (c - (1.0 - a)[..., None]) / np.maximum(a, 1e-4)[..., None]
    f = np.clip(f, 0, 1)
    out = np.dstack([f, a])
    return (out * 255 + 0.5).astype(np.uint8)


def cut(sheet: np.ndarray, cx: int, top: int, half_w: int) -> Image.Image:
    crop = sheet[top : top + CELL_H, cx - half_w : cx + half_w]
    art = Image.fromarray(to_rgba(crop), "RGBA")
    cell = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    cell.alpha_composite(art, ((CELL_W - art.width) // 2, 0))
    return cell


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    done = []
    for spec in (V2, V1):
        sheet = np.asarray(Image.open(spec["src"]).convert("RGB"))
        for rank in spec["rank"]:
            i = rank if spec is V1 else spec["rank"].index(rank)
            cut(sheet, spec["cx"][i], spec["top"], spec["half_w"]).save(
                OUT / f"rank-{rank:02d}.webp", "WEBP", quality=92, method=6
            )
            done.append(rank)
    assert sorted(done) == list(range(17)), done
    print(f"{len(done)}개 → {OUT}")


if __name__ == "__main__":
    main()
