import math, json, sys
# Camera yaw that puts the gate (0, 105) at screen x = gate_s, and chariot spots at screen x = s1.. at distance dist.
# plan.py camx camz camy fov aspect gate_s "s1,s2,s3" dist targety
cx, cz, cy, fov, asp, gs = map(float, sys.argv[1:7]); ss = [float(v) for v in sys.argv[7].split(',')]; D = float(sys.argv[8]); ty = float(sys.argv[9])
th = math.tan(math.radians(fov / 2)) * asp
gx, gz = 0.0, 105.0
ang_g = math.atan2(gz - cz, gx - cx)   # direction to gate in xz
# screen-right r = cross(f, up) = (-fz, 0, fx) ; s = dot(p-C, r)/(dot(p-C,f)*th)
# yaw a: f=(cos a, sin a). For gate at s=gs: tan(angle offset) = gs*th, the gate is to the screen right.
# r = (-sin a, cos a)... dot(g, r) = |g| sin(ang_g - a)*(-1)? solve numerically
def s_of(a, px, pz):
    fx, fz = math.cos(a), math.sin(a); rx, rz = -fz, fx
    # three: right = cross(f, up) with up=y: (fy*0 - fz*1, fz*0 - fx*0, fx*1 - fy*0) = (-fz, 0, fx)
    dx, dz = px - cx, pz - cz
    return (dx * rx + dz * rz) / ((dx * fx + dz * fz) * th)
lo, hi = ang_g - 1.2, ang_g + 1.2
for _ in range(80):
    m = (lo + hi) / 2
    if (s_of(m, gx, gz) - gs) * (s_of(lo, gx, gz) - gs) <= 0: hi = m
    else: lo = m
a = (lo + hi) / 2
fx, fz = math.cos(a), math.sin(a); rx, rz = -fz, fx
poses = []
for s in ss:
    px = cx + D * fx + s * D * th * rx; pz = cz + D * fz + s * D * th * rz
    poses.append([round(px, 2), round(pz, 2)])
T = [round(cx + 30 * fx, 2), ty, round(cz + 30 * fz, 2)]
print(json.dumps({"pos": [cx, cy, cz], "target": T}), json.dumps(poses), 'check gate s', round(s_of(a, gx, gz), 3))
