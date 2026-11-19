"""시연용 쇼츠 영상 만들기: 모션코믹 (원고를 컷별로 나눠 한 컷씩 카메라 이동).

    python3 scripts/make_demo_shorts.py        (app 폴더, ffmpeg·Pillow·numpy 필요)

입력: public/covers/<slug>.jpg (480x720), public/episodes/<slug>-1.jpg (724x2172)
출력: public/shorts/<slug>.mp4 (720x1280, 30fps, 무음)

흐름: 표지 인트로 → 1화 컷 1, 2, 3 … (컷마다 확대·가로 패닝·세로 틸트 중 하나, 아래에서 밀려 올라오며 등장)
     → 펀딩 안내. 장면 사이는 교차 페이드.
컷 검출: 행·열의 밝기 표준편차가 낮은 줄(거터)로 원고를 가로 띠 → 세로 칸 순으로 나눈다.
사선 거터는 나뉘지 않으므로 그런 띠는 한 컷으로 두고 카메라가 훑는다.
"""
import math
import pathlib
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

APP = pathlib.Path(__file__).resolve().parent.parent
PUB = APP / "public"
FONT = APP / "assets/fonts"
W, H, FPS = 720, 1280, 30
PINK, INK = (246, 169, 191), (91, 26, 51)
FADE = 0.35  # 장면 사이 교차 페이드 (초)
PANEL_CY = 600  # 컷을 놓는 세로 중심. 앱 쇼츠 화면은 아래 4분의 1을 펀딩 카드가 덮는다

SHORTS = [
    # slug, 제목, 장르, 첫 문장(훅), 마지막 카드 상태
    ("akn", "악녀인데 남주들이 나를 숭배한다", "로맨스 판타지", "악녀로 눈을 떴는데,\n남주들이 나를 숭배한다?", "지금 조각 청약 중"),
    ("cwd", "청월도", "무협", "멸문한 가문의 막내,\n푸른 달 아래 검을 들다", "조각 마켓에서 거래 중"),
    ("sgl", "시골에선 슬로우라이프", "힐링 · 일상", "번아웃 직장인,\n시골로 도망쳤다", "지금 조각 청약 중"),
]


# ---------- 공통 그리기 ----------

def font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT / f"Pretendard-{weight}.otf"), size)


def ease(x: float) -> float:
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def cover_fill(im: Image.Image, w: int, h: int) -> Image.Image:
    s = max(w / im.width, h / im.height)
    r = im.resize((math.ceil(im.width * s), math.ceil(im.height * s)))
    x, y = (r.width - w) // 2, (r.height - h) // 2
    return r.crop((x, y, x + w, y + h))


def backdrop(im: Image.Image, w: int, h: int, dim: float = 0.45) -> Image.Image:
    return cover_fill(im, w, h).filter(ImageFilter.GaussianBlur(28)).point(lambda v: int(v * dim))


def centered(d: ImageDraw.ImageDraw, y: int, text: str, f, fill, w: int = W, spacing: int = 10) -> int:
    for line in text.split("\n"):
        d.text(((w - d.textlength(line, font=f)) / 2, y), line, font=f, fill=fill)
        y += f.size + spacing
    return y


def pill(d: ImageDraw.ImageDraw, cx: float, y: int, text: str, f, bg, fg, pad=(28, 14)) -> None:
    tw = d.textlength(text, font=f)
    x0, x1 = cx - tw / 2 - pad[0], cx + tw / 2 + pad[0]
    d.rounded_rectangle((x0, y, x1, y + f.size + pad[1] * 2), radius=(f.size + pad[1] * 2) // 2, fill=bg)
    d.text((x0 + pad[0], y + pad[1] - 2), text, font=f, fill=fg)


# ---------- 컷 검출 ----------

def _runs(mask, minlen=3):
    out, start = [], None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        if not v and start is not None:
            if i - start >= minlen:
                out.append((start, i))
            start = None
    if start is not None and len(mask) - start >= minlen:
        out.append((start, len(mask)))
    return out


def _between(n, gutters, minsize):
    edges = [0] + [x for g in gutters for x in g] + [n]
    return [(edges[i], edges[i + 1]) for i in range(0, len(edges), 2) if edges[i + 1] - edges[i] >= minsize]


def detect_cuts(page: Image.Image, thr: float = 14) -> list[tuple[int, int, int, int]]:
    a = np.asarray(page.convert("L")).astype(float)
    h, w = a.shape
    cuts = []
    for y0, y1 in _between(h, _runs(a.std(axis=1) < thr), 60):
        band = a[y0:y1]
        cols = [r for r in _runs(band.std(axis=0) < thr) if r[0] > 40 and r[1] < w - 40]
        for x0, x1 in _between(w, cols, 120):
            sub = a[y0:y1, x0:x1]
            rows, cs = np.where(sub.std(axis=1) >= thr)[0], np.where(sub.std(axis=0) >= thr)[0]
            if len(rows) and len(cs):
                cuts.append((x0 + int(cs[0]), y0 + int(rows[0]), x0 + int(cs[-1]) + 1, y0 + int(rows[-1]) + 1))
    return cuts


# ---------- 장면 ----------

class Scene:
    dur: float

    def frame(self, t: float) -> Image.Image:  # t: 0..dur
        raise NotImplementedError


class Still(Scene):
    """그려 둔 카드를 천천히 확대 (켄번스)"""

    def __init__(self, card: Image.Image, dur: float, zoom: float = 0.06):
        self.card, self.dur, self.zoom = card, dur, zoom

    def frame(self, t):
        z = 1 + self.zoom * ease(t / self.dur)
        cw, ch = W / z, H / z
        x, y = (W - cw) / 2, (H - ch) / 2
        return self.card.crop((round(x), round(y), round(x + cw), round(y + ch))).resize((W, H), Image.BILINEAR)


class Cut(Scene):
    """원고의 한 컷을 화면 상자에 확대해 보여 주며 카메라를 움직인다.
    mode: zoom(컷 전체 → 가운데로 확대) | pan(넓은 컷을 키워서 왼→오) | tilt(긴 컷을 키워서 위→아래)"""

    BOX_W = 680

    def __init__(self, img: Image.Image, mode: str, dur: float):
        self.img, self.mode, self.dur = img, mode, dur
        cw, ch = img.size
        bw = self.BOX_W
        if mode == "pan":
            sc = min(2.0, 560 / ch)  # 높이를 키우고 가로로 훑는다
            bh = round(ch * sc)
        elif mode == "tilt":
            sc = min(1.6, bw / (cw * 0.78))
            bh = min(820, round(ch * sc))
        else:
            sc = min(1.9, bw / cw)
            bw, bh = round(cw * sc), round(ch * sc)
        self.sc, self.bw, self.bh = sc, bw, bh
        vw, vh = bw / sc, bh / sc  # 원고에서 잘라 올 크기
        if mode == "pan":
            self.path = ((0, (ch - vh) / 2), (cw - vw, (ch - vh) / 2))
        elif mode == "tilt":
            self.path = ((cw - vw) * 0.2, 0), ((cw - vw) * 0.8, ch - vh)
        else:
            self.path = ((0, 0), (0, 0))
        self.vw, self.vh = vw, vh
        self.bg = backdrop(img, int(W * 1.08), int(H * 1.08))
        self.mask = Image.new("L", (bw, bh), 0)
        ImageDraw.Draw(self.mask).rounded_rectangle((0, 0, bw - 1, bh - 1), radius=18, fill=255)
        sh = Image.new("L", (bw + 80, bh + 80), 0)
        ImageDraw.Draw(sh).rounded_rectangle((40, 50, bw + 40, bh + 50), radius=24, fill=150)
        self.shadow = sh.filter(ImageFilter.GaussianBlur(18))

    def frame(self, t):
        p = ease(t / self.dur)
        bx, by = int((self.bg.width - W) * (1 - p)), int((self.bg.height - H) / 2)  # 배경은 반대로 흘러 깊이감
        out = self.bg.crop((bx, by, bx + W, by + H))
        (x0, y0), (x1, y1) = self.path
        x, y = x0 + (x1 - x0) * p, y0 + (y1 - y0) * p
        z = 1 + (0.12 if self.mode == "zoom" else 0.04) * p  # 천천히 다가가기
        vw, vh = self.vw / z, self.vh / z
        x, y = x + (self.vw - vw) / 2, y + (self.vh - vh) / 2
        panel = self.img.crop((round(x), round(y), round(x + vw), round(y + vh))).resize((self.bw, self.bh), Image.BICUBIC)
        rise = 46 * (1 - ease(t / 0.45))  # 아래에서 밀려 올라오며 등장
        px = (W - self.bw) // 2
        py = int(max(40, PANEL_CY - self.bh / 2) + rise)
        out.paste((0, 0, 0), (px - 40, py - 40), self.shadow)
        out.paste(panel, (px, py), self.mask)
        return out


def intro_card(cover: Image.Image, genre: str, hook: str) -> Image.Image:
    im = backdrop(cover, W, H)
    d = ImageDraw.Draw(im)
    pill(d, W / 2, 110, f"{genre} · 1화 미리보기", font("SemiBold", 30), PINK, INK)
    centered(d, 200, hook, font("Bold", 50), (255, 255, 255))
    c = cover.resize((440, 660), Image.LANCZOS)
    im.paste(c, ((W - 440) // 2, 360))
    return im


def outro_card(cover: Image.Image, title: str, status: str) -> Image.Image:
    im = backdrop(cover, W, H, 0.35)
    c = cover.resize((320, 480), Image.LANCZOS)
    im.paste(c, ((W - 320) // 2, 110))
    d = ImageDraw.Draw(im)
    y = centered(d, 630, title, font("Bold", 44), (255, 255, 255))
    centered(d, y + 4, status, font("Medium", 32), PINK)
    pill(d, W / 2, y + 90, "DIBS에서 작품 조각 모으기", font("Bold", 34), PINK, INK, pad=(40, 20))
    return im


def scenes_for(slug: str, title: str, genre: str, hook: str, status: str) -> list[Scene]:
    cover = Image.open(PUB / "covers" / f"{slug}.jpg").convert("RGB")
    page = Image.open(PUB / "episodes" / f"{slug}-1.jpg").convert("RGB")
    out: list[Scene] = [Still(intro_card(cover, genre, hook), 2.4)]
    for i, (x0, y0, x1, y1) in enumerate(detect_cuts(page)):
        img = page.crop((x0, y0, x1, y1))
        w, h = img.size
        if i == 0 or w < 450:
            mode, dur = "zoom", 2.6  # 제목 컷, 두 칸짜리 줄의 한 칸
        elif h / w > 0.55:
            mode, dur = "tilt", 3.8  # 세로로 긴 컷 (사선으로 나뉜 여러 칸 포함)
        else:
            mode, dur = "pan", 3.6  # 가로로 넓은 컷
        out.append(Cut(img, mode, dur))
    out.append(Still(outro_card(cover, title, status), 3.0, zoom=0.03))
    return out


def render(scenes: list[Scene], path: pathlib.Path) -> float:
    starts, t = [], 0.0
    for i, s in enumerate(scenes):
        starts.append(t)
        t += s.dur - (FADE if i < len(scenes) - 1 else 0)
    total = t
    proc = subprocess.Popen([
        "ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(path),
    ], stdin=subprocess.PIPE)
    for n in range(int(total * FPS)):
        now = n / FPS
        live = [(i, now - starts[i]) for i, s in enumerate(scenes) if starts[i] <= now < starts[i] + s.dur]
        i, lt = live[-1]
        img = scenes[i].frame(lt)
        if len(live) > 1 and lt < FADE:  # 앞 장면과 교차 페이드
            j, pt = live[-2]
            img = Image.blend(scenes[j].frame(pt), img, ease(lt / FADE))
        proc.stdin.write(img.tobytes())
    proc.stdin.close()
    if proc.wait():
        raise SystemExit(f"ffmpeg 실패: {path}")
    return total


if __name__ == "__main__":
    for row in SHORTS:
        out = PUB / "shorts" / f"{row[0]}.mp4"
        sc = scenes_for(*row)
        sec = render(sc, out)
        print(out.relative_to(APP), f"컷 {len(sc) - 2}개, {sec:.1f}초, {out.stat().st_size / 1e6:.1f}MB")
