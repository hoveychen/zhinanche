# comp3.py DIR N alphas [order far->near]
# poseI.png (car + its shadow), poseIns.png (car, no shadow), bg.png (no car).
# Body mask = poseIns vs bg; shadow = poseI / poseIns outside the body. All shadows are
# multiplied in first, then the bodies far to near, so no car's shadow lands on another's body.
import sys
import numpy as np
from PIL import Image, ImageFilter
d = sys.argv[1]; n = int(sys.argv[2]); al = [float(a) for a in sys.argv[3].split(',')]
order = [int(i) for i in sys.argv[4].split(',')] if len(sys.argv) > 4 else list(range(n))
L = lambda p: np.asarray(Image.open(p).convert('RGB')).astype(np.float32)
def blur(m, r=1.0):
    return np.asarray(Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255
bg = L(f'{d}/bg.png'); out = bg.copy(); bodies = []
for i in range(n):
    im = L(f'{d}/pose{i}.png'); ns = L(f'{d}/pose{i}ns.png')
    m = blur(np.clip((np.abs(ns - bg).max(axis=2) - 6) / 18, 0, 1))
    r = np.clip((im + 2) / (ns + 2), 0, 1)
    out = out * (1 - (1 - r) * (1 - m)[..., None] * al[i])
    bodies.append((im, m))
for i in order:
    im, m = bodies[i]; a = (m * al[i])[..., None]
    out = out * (1 - a) + im * a
Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(f'{d}/comp.png')
