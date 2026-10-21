# The paintings on the chariot's box (design/decisions/0008): 宋史 輿服志 has the
# 指南車 "赤質，兩箱畫青龍、白虎，四面畫花鳥". The three pictures in murals/ were
# generated for this project (an image model, prompted for Song court painting
# in mineral colours and gold line on red lacquer); this lays them out on the
# box's grid of squares (blender/scripts/build_chariot.py lattice(), printed as
# MURAL lines by pnpm build:model): three pictures, each 3 : 1
#   dragon   the left box, 12 x 4 squares, the dragon in the middle 6 x 2
#   tiger    the right box, 12 x 4 squares, the tiger in the middle 6 x 2
#   flowers  front and back, 11 x 4 squares
# a flower or bird in every other square. materials.js maps each onto its
# panel (u to the right as seen from outside, so both beasts face the front).
# Three files, not one atlas: a 2048² going up with its mipmaps took a 60-75 ms
# frame; the page uploads these 0.4 s apart (js/scene/photo.js murals()).
#
#   uv run --with pillow tools/assets/build_murals.py
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "assets", "photo")
SIDE = (12, 4, 10.4, 3.55)    # squares along, up; size (chi)
ENDS = (11, 4, 9.0, 3.55)
HEART = (3, 9, 1, 3)          # i0, i1, j0, j1 (lattice(heart=True) for 12 x 4)
SIZE = 2048
PX = 200                      # px per chi while laying out


def tiles():
    """The 16 flower-and-bird squares of the 4 x 4 sheet, each cut a little inside its edges."""
    im = Image.open(os.path.join(HERE, "murals", "flowers.jpg"))
    s = im.width / 4
    m = s * 0.03
    return [im.crop((round(c * s + m), round(r * s + m), round((c + 1) * s - m), round((r + 1) * s - m))) for r in range(4) for c in range(4)]


def band(spec, heart, beast, shift):
    nu, nw, w, h = spec
    W, H = round(w * PX), round(h * PX)
    out = Image.new("RGB", (W, H))
    t = tiles()
    k = shift
    for i in range(nu):
        for j in range(nw):
            if heart and heart[0] <= i < heart[1] and heart[2] <= j < heart[3]:
                continue
            x0, x1 = round(W * i / nu), round(W * (i + 1) / nu)
            y0, y1 = round(H * j / nw), round(H * (j + 1) / nw)
            tile = t[(k * 7) % len(t)]
            k += 1
            if (i + j) % 2:
                tile = tile.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            out.paste(tile.resize((x1 - x0, y1 - y0), Image.Resampling.LANCZOS), (x0, y0))
    if heart:
        x0, x1 = round(W * heart[0] / nu), round(W * heart[1] / nu)
        # rows count up from the bottom on the panel, down from the top in the picture
        y0, y1 = round(H * (nw - heart[3]) / nw), round(H * (nw - heart[2]) / nw)
        # both beasts walk toward the front: on the left box that is to the left as you look at it,
        # on the right box to the right; the dragon was drawn walking right, the tiger left
        pic = Image.open(os.path.join(HERE, "murals", f"{beast}.jpg")).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        out.paste(pic.resize((x1 - x0, y1 - y0), Image.Resampling.LANCZOS), (x0, y0))
    return out.resize((SIZE, SIZE // 3), Image.Resampling.LANCZOS)


def main():
    for name, b in (("dragon", band(SIDE, HEART, "dragon", 0)), ("tiger", band(SIDE, HEART, "tiger", 5)), ("flowers", band(ENDS, None, None, 11))):
        for s in (2048, 1024):
            path = os.path.join(OUT, f"chariot-murals-{name}-{s}.webp")
            b.resize((s, s // 3), Image.Resampling.LANCZOS).save(path, quality=80, method=6)
            print(path, os.path.getsize(path))


if __name__ == "__main__":
    main()
