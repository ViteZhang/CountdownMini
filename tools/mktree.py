# 生成成长树的七个阶段图标。
# 环境里没有 PIL / cairosvg / imagemagick，所以自己写 PNG 编码 + SDF 抗锯齿栅格化。
import zlib, struct, math, os

S = 200
W = 11.0                 # 主描边宽度
GROUND_Y = 178.0
TRUNK_X = 100.0
COLOR = (0x6E, 0x94, 0x80)   # 品牌绿：浅底深底都读得清，一套图两个主题够用

def clamp(v, a, b): return a if v < a else (b if v > b else v)

def sd_seg(px, py, ax, ay, bx, by):
    vx, vy = bx-ax, by-ay
    wx, wy = px-ax, py-ay
    t = clamp((wx*vx+wy*vy)/(vx*vx+vy*vy+1e-9), 0, 1)
    return math.hypot(wx-t*vx, wy-t*vy)

def sd_circle(px, py, cx, cy, r):
    return math.hypot(px-cx, py-cy) - r

def sd_ellipse(px, py, cx, cy, rx, ry, deg=0.0):
    """近似椭圆有符号距离。够用来描边，也够用来填充。"""
    a = math.radians(-deg)
    dx, dy = px-cx, py-cy
    c, s = math.cos(a), math.sin(a)
    ux, uy = dx*c - dy*s, dx*s + dy*c
    k1 = math.hypot(ux/rx, uy/ry)
    k2 = math.hypot(ux/(rx*rx), uy/(ry*ry))
    return k1*(k1-1)/(k2+1e-9)

def stroke(f, w=W):
    return lambda x, y: abs(f(x, y)) - w/2

def fill(f):
    return f

def seg(ax, ay, bx, by, w=W):
    return stroke(lambda x, y: sd_seg(x, y, ax, ay, bx, by), w)

def leaf(cx, cy, rx, ry, deg, w=None):
    """叶子 = 椭圆轮廓 + 一条中脉。比三个圆更像叶子。"""
    w = w or W*0.80
    body = stroke(lambda x, y: sd_ellipse(x, y, cx, cy, rx, ry, deg), w)
    a = math.radians(deg)
    # 中脉别画满：椭圆是近似 SDF，画满会从叶尖戳出去，看着像小尾巴
    hx, hy = math.cos(a)*rx*0.44, -math.sin(a)*rx*0.44
    rib = seg(cx-hx, cy-hy, cx+hx, cy+hy, w*0.55)
    return [body, rib]

def dot(cx, cy, r):
    return fill(lambda x, y: sd_circle(x, y, cx, cy, r))

def ring(cx, cy, r, w=None):
    return stroke(lambda x, y: sd_circle(x, y, cx, cy, r), w or W*0.75)

def ground():
    return [seg(60, GROUND_Y, 140, GROUND_Y, W*0.72)]

def trunk_to(top, w=W*0.86):
    return seg(TRUNK_X, GROUND_Y, TRUNK_X, top, w)

def crown(cy, rx, ry, w=None):
    return stroke(lambda x, y: sd_ellipse(x, y, TRUNK_X, cy, rx, ry, 0), w or W*0.86)

# ---------------- 七个阶段 ----------------

def st_seed():
    # 一粒种子躺在土上。还没有任何枝叶 —— 这一阶段的克制本身就是内容。
    return ground() + [fill(lambda x, y: sd_ellipse(x, y, TRUNK_X, 164, 15, 11, -18))]

def st_sprout():
    # 破土：一截芽 + 两片子叶
    out = ground() + [trunk_to(136)]
    out += leaf(74, 128, 24, 12, 22)
    out += leaf(126, 128, 24, 12, -22)
    return out

def st_branch():
    # 抽枝：主干抬高，抽出两根侧枝，枝头各一片小叶
    out = ground() + [trunk_to(100),
                      seg(TRUNK_X, 142, 72, 120, W*0.62),
                      seg(TRUNK_X, 126, 130, 106, W*0.62)]
    out += leaf(58, 110, 20, 10, 26)
    out += leaf(144, 96, 20, 10, -26)
    # 顶芽斜着长。画成水平的会像扣了个盘子，不像叶子
    out += leaf(112, 82, 19, 10, 52)
    return out

def st_leaf():
    # 成叶：叶片变多，树形开始铺开
    out = ground() + [trunk_to(84),
                      seg(TRUNK_X, 146, 68, 124, W*0.6),
                      seg(TRUNK_X, 128, 134, 108, W*0.6),
                      seg(TRUNK_X, 110, 74, 92, W*0.6)]
    out += leaf(52, 116, 21, 11, 26)
    out += leaf(150, 100, 21, 11, -26)
    out += leaf(58, 84, 21, 11, 22)
    out += leaf(114, 66, 21, 11, 52)
    return out

CROWN_CY, CROWN_RX, CROWN_RY = 84.0, 58.0, 46.0

def on_crown(deg):
    """树冠轮廓上的一点。花苞和花都挂在轮廓上 ——
    塞进冠内会变成两只眼睛，一看就是张脸。"""
    a = math.radians(deg)
    return (TRUNK_X + CROWN_RX*math.cos(a), CROWN_CY - CROWN_RY*math.sin(a))

def st_lush():
    # 繁茂：不再画单片叶子，收成一个完整树冠。
    # 这里换语言是有意的 —— 前四个阶段数得清叶子，从这里开始数不清了。
    # 冠内不加枝条：那两笔在小尺寸下像裂纹，不像树。
    # 主干正好顶在树冠下缘上：多一点会在冠里露出个断头，少一点会留缝。
    # 冠的描边宽度刚好盖住主干的圆头。
    return ground() + [trunk_to(CROWN_CY + CROWN_RY),
                       crown(CROWN_CY, CROWN_RX, CROWN_RY)]

def st_bud():
    # 结蕾：树冠边缘鼓出几个花苞
    out = st_lush()
    for deg, r in ((150, 8.6), (74, 9.2), (16, 8.0)):
        cx, cy = on_crown(deg)
        out.append(dot(cx, cy, r))
    return out

def st_bloom():
    # 开花：花苞变成花。空心花瓣 + 花心，比实心点更像花。
    out = st_lush()
    for deg in (170, 116, 58, 6):
        cx, cy = on_crown(deg)
        out += [ring(cx, cy, 10, W*0.5), dot(cx, cy, 3.6)]
    return out

# ---------------- 栅格化 ----------------

def render(shapes):
    px = bytearray(S*S)
    for y in range(S):
        fy = y + 0.5
        row = y*S
        for x in range(S):
            fx = x + 0.5
            a = 0.0
            for f in shapes:
                d = f(fx, fy)
                if d < 0.5:
                    c = clamp(0.5 - d, 0.0, 1.0)
                    if c > a:
                        a = c
                        if a >= 1.0: break
            px[row+x] = int(round(a*255))
    return px

def write_png(path, alpha, rgb):
    r, g, b = rgb
    raw = bytearray()
    for y in range(S):
        raw.append(0)
        for x in range(S):
            a = alpha[y*S+x]
            raw += bytes((r, g, b, a))
    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', S, S, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
           + chunk(b'IEND', b''))
    open(path, 'wb').write(png)

os.makedirs('images/tree', exist_ok=True)
STAGES = [('seed', st_seed), ('sprout', st_sprout), ('branch', st_branch),
          ('leaf', st_leaf), ('lush', st_lush), ('bud', st_bud), ('bloom', st_bloom)]
for key, fn in STAGES:
    p = 'images/tree/%s.png' % key
    write_png(p, render(fn()), COLOR)
    print(p, os.path.getsize(p), 'bytes')
