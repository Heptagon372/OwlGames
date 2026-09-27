"""브랜드 그림(사용자 제공) → public/assets/brand/ · app/icon.png · app/opengraph-image.png

입력 두 장 (scripts/src/):
  brand-frame.webp  네온 티켓 프레임 (검은 배경 RGB, 위쪽에 부엉이)
  brand-owl.png     부엉이 마크 (배경 투명 RGBA)

프레임 안쪽 빈 판에 **부엉이 마크 + 아울게임즈 / OWL GAMES** 를 얹어 배너를 만든다.
글자는 시안→바이올렛→마젠타 그라데이션(.grad-text 와 같은 색)이고 한글은 Pretendard, 영문은 Orbitron.
검은 배경은 **가장 밝은 채널을 알파로 삼아**(black→alpha) 지운다 — survive-mobs·obstacles 와 같은 방법이라
밤하늘 배경 위에 그대로 올라간다.

실행: python scripts/slice-brand.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/src"
OUT = ROOT / "public/assets/brand"

KO_FONT = ROOT / "node_modules/pretendard/dist/public/static/Pretendard-ExtraBold.otf"
EN_FONT = ROOT / "public/assets/orbitron/orbitron-variable.ttf"
KO_TEXT = "아울게임즈"
EN_TEXT = "O W L  G A M E S"

# 프레임 안쪽 판 (brand-frame.webp 1536×1024 기준, 네온 테두리 안쪽으로 여유를 둔 자리)
BOX = (268, 412, 1272, 778)
LOGO_H = 268  # 판 안에 들어가는 부엉이 높이
GAP = 46  # 부엉이 ↔ 글자
LINE_GAP = 26  # 한글 ↔ 영문
# .grad-text 와 같은 색 (aqua → neon → magenta)
STOPS = [(0.0, (34, 211, 238)), (0.55, (167, 139, 250)), (1.0, (232, 121, 249))]
NIGHT = (7, 11, 24)  # --color-night


def black_to_alpha(img: Image.Image, gain: float = 1.15) -> Image.Image:
    """검은 배경을 투명으로 — 가장 밝은 채널이 알파가 된다"""
    a = np.array(img.convert("RGB")).astype(np.float32)
    alpha = np.clip(a.max(axis=2) * gain, 0, 255).astype(np.uint8)
    out = img.convert("RGBA")
    out.putalpha(Image.fromarray(alpha))
    return out


def gradient(w: int, h: int, x0: int, span: int) -> Image.Image:
    """x0 에서 x0+span 까지 가로로 흐르는 그라데이션"""
    row = Image.new("RGB", (w, 1))
    px = row.load()
    for x in range(w):
        t = min(1.0, max(0.0, (x - x0) / max(1, span)))
        for i in range(len(STOPS) - 1):
            a, ca = STOPS[i]
            b, cb = STOPS[i + 1]
            if t <= b or i == len(STOPS) - 2:
                u = 0.0 if b == a else min(1.0, max(0.0, (t - a) / (b - a)))
                px[x, 0] = tuple(round(ca[j] + (cb[j] - ca[j]) * u) for j in range(3))
                break
    return row.resize((w, h))


def build_banner() -> Image.Image:
    frame = Image.open(SRC / "brand-frame.webp").convert("RGBA")
    owl = Image.open(SRC / "brand-owl.png").convert("RGBA")
    owl = owl.crop(owl.getbbox())
    w, h = frame.size
    bx0, by0, bx1, by1 = BOX
    cy = (by0 + by1) // 2

    logo = owl.resize((round(owl.width * LOGO_H / owl.height), LOGO_H), Image.LANCZOS)
    ko = ImageFont.truetype(str(KO_FONT), 132)
    en = ImageFont.truetype(str(EN_FONT), 52)
    kb, eb = ko.getbbox(KO_TEXT), en.getbbox(EN_TEXT)
    kw, kh = kb[2] - kb[0], kb[3] - kb[1]
    ew, eh = eb[2] - eb[0], eb[3] - eb[1]

    text_w = max(kw, ew)
    text_h = kh + LINE_GAP + eh
    x0 = (bx0 + bx1) // 2 - (logo.width + GAP + text_w) // 2
    tx, ty = x0 + logo.width + GAP, cy - text_h // 2

    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.text((tx - kb[0], ty - kb[1]), KO_TEXT, font=ko, fill=255)
    d.text((tx - eb[0], ty + kh + LINE_GAP - eb[1]), EN_TEXT, font=en, fill=255)
    grad = gradient(w, h, tx, text_w)

    out = frame.copy()
    for radius, alpha in ((26, 110), (10, 150)):  # 바깥 글로우 (.text-glow)
        glow = Image.new("RGBA", (w, h), 0)
        blurred = mask.filter(ImageFilter.GaussianBlur(radius)).point(lambda v: v * alpha // 255)
        glow.paste(grad, (0, 0), blurred)
        out = Image.alpha_composite(out, glow)
    owl_glow = Image.new("RGBA", (w, h), 0)
    owl_glow.paste(logo, (x0, cy - LOGO_H // 2), logo)
    out = Image.alpha_composite(out, owl_glow.filter(ImageFilter.GaussianBlur(22)))
    body = Image.new("RGBA", (w, h), 0)
    body.paste(grad, (0, 0), mask)
    out = Image.alpha_composite(out, body)
    out.alpha_composite(logo, (x0, cy - LOGO_H // 2))
    return out


def for_light(img: Image.Image) -> Image.Image:
    """라이트 테마용 사본 — 밝은 하늘 위에서도 읽히게
    번지는 글로우를 줄이고(알파 감마) 선 색을 진하게(곱) 낮춘다"""
    a = np.array(img).astype(np.float32)
    alpha = (a[..., 3] / 255.0) ** 1.7
    rgb = np.clip(a[..., :3] * 0.5, 0, 255)
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    banner = build_banner()

    # 배너 — 검은 배경을 지우고 글로우 여백만 남긴다
    cut = black_to_alpha(banner)
    box = cut.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    cut = cut.crop(box)
    cut.save(OUT / "banner.webp", quality=95, method=6)
    for_light(cut).save(OUT / "banner-light.webp", quality=95, method=6)

    # 부엉이 마크 — 헤더·카드용
    owl = Image.open(SRC / "brand-owl.png").convert("RGBA")
    owl = owl.crop(owl.getbbox())
    side = max(owl.size)
    square = Image.new("RGBA", (side, side), 0)
    square.alpha_composite(owl, ((side - owl.width) // 2, (side - owl.height) // 2))
    small = square.resize((512, 512), Image.LANCZOS)
    small.save(OUT / "owl.webp", quality=95, method=6)
    for_light(small).save(OUT / "owl-light.webp", quality=95, method=6)

    # 파비콘 — 밤하늘 둥근 사각 위의 부엉이
    icon = Image.new("RGBA", (512, 512), 0)
    ImageDraw.Draw(icon).rounded_rectangle((0, 0, 511, 511), radius=112, fill=(*NIGHT, 255))
    mark = square.resize((384, 384), Image.LANCZOS)
    icon.alpha_composite(mark, (64, 64))
    icon.save(ROOT / "app/icon.png")
    icon.resize((180, 180), Image.LANCZOS).save(ROOT / "app/apple-icon.png")

    # OG 이미지 — 밤하늘 위 배너 (1200×630)
    og = Image.new("RGBA", (1200, 630), (*NIGHT, 255))
    bw = 1060
    bh = round(cut.height * bw / cut.width)
    og.alpha_composite(cut.resize((bw, bh), Image.LANCZOS), (70, (630 - bh) // 2))
    og.convert("RGB").save(ROOT / "app/opengraph-image.png")

    print(f"banner(+light) {cut.size} · owl 512 · icon 512 · og 1200×630 → {OUT}")


if __name__ == "__main__":
    main()
