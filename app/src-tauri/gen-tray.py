import zlib, struct
W = H = 44
px = [[(0, 0, 0, 0)] * W for _ in range(H)]

def set_px(x, y):
    if 0 <= x < W and 0 <= y < H:
        px[y][x] = (0, 0, 0, 255)

def line(x0, y0, x1, y1):
    dx, dy = abs(x1 - x0), abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx - dy
    while True:
        set_px(x0, y0)
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 > -dy:
            err -= dy; x0 += sx
        if e2 < dx:
            err += dx; y0 += sy

def thick_line(x0, y0, x1, y1, is_horiz=False):
    """Draw a 2px thick line. For horiz/near-horiz lines, offset in y; else in x."""
    line(x0, y0, x1, y1)
    if is_horiz or abs(y1 - y0) < abs(x1 - x0):
        # Nearly horizontal: thicken by offset in y
        line(x0, y0 + 1, x1, y1 + 1)
    else:
        # Nearly vertical: thicken by offset in x
        line(x0 + 1, y0, x1 + 1, y1)

# 🜃: downward triangle outline + horizontal bar
# top-left (6,8), top-right (38,8), tip (22,36)
thick_line(6, 8, 38, 8, is_horiz=True)   # top edge
thick_line(6, 8, 22, 36)  # left side
thick_line(38, 8, 22, 36) # right side

# horizontal bar 3px tall centered at y=28 (low, near the tip)
bar_y = 28
t = (bar_y - 8) / (36 - 8)
bar_x0 = round(6 + t * (22 - 6))
bar_x1 = round(38 - t * (38 - 22))
# Draw three rows for 3px height
for bar_y_offset in [bar_y - 1, bar_y, bar_y + 1]:
    thick_line(bar_x0, bar_y_offset, bar_x1, bar_y_offset, is_horiz=True)
raw = bytearray()
for y in range(H):
    raw.append(0)
    for x in range(W):
        raw += bytes(px[y][x])
def chunk(t, d):
    return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
with open('icons/tray.png', 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
            + chunk(b'IEND', b''))
print('wrote icons/tray.png')
