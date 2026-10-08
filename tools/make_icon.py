"""
Renders the app icon (striped sun + ship chevron) straight to assets/icon.ico.
Pure Python, no image libraries: draws with 4x4 supersampling, encodes PNG
with zlib, and wraps the PNGs in an ICO container.

    python tools/make_icon.py
"""

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BG = (7, 2, 15)
CYAN = (63, 240, 255)
SUN_TOP = (255, 230, 109)
SUN_BOTTOM = (255, 46, 136)
CHEVRON = [(32, 14), (40, 40), (32, 35), (24, 40)]  # same 64x64 space as icon.svg


def inside_poly(x, y, poly):
    hit = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def dist_to_edges(x, y, poly):
    best = 1e9
    for i in range(len(poly)):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % len(poly)]
        dx, dy = bx - ax, by - ay
        t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
        px, py = ax + dx * t - x, ay + dy * t - y
        best = min(best, (px * px + py * py) ** 0.5)
    return best


def sample(x, y):
    """Colour at (x, y) in 64-unit icon space, or None if transparent."""
    r = 12
    cx = min(max(x, r), 64 - r)
    cy = min(max(y, r), 64 - r)
    if (x - cx) ** 2 + (y - cy) ** 2 > r * r:
        return None
    if dist_to_edges(x, y, CHEVRON) < 1.0:
        return CYAN
    if inside_poly(x, y, CHEVRON):
        return BG
    in_cut = y < 33 or 36 < y < 40 or 43 < y < 46 or 49 < y < 51
    if in_cut and (x - 32) ** 2 + (y - 34) ** 2 < 22 * 22:
        t = min(1, max(0, (y - 12) / 44))
        return tuple(round(a + (b - a) * t) for a, b in zip(SUN_TOP, SUN_BOTTOM))
    return BG


def render(size, ss=4):
    rows = []
    for py in range(size):
        row = bytearray([0])  # PNG filter byte
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    c = sample((px + (sx + 0.5) / ss) * 64 / size, (py + (sy + 0.5) / ss) * 64 / size)
                    if c:
                        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 255
            covered = acc[3] / 255  # samples that hit the icon
            if covered:
                row += bytes([round(acc[0] / covered), round(acc[1] / covered), round(acc[2] / covered), round(acc[3] / (ss * ss))])
            else:
                row += bytes([0, 0, 0, 0])
        rows.append(bytes(row))
    return png(size, size, b"".join(rows))


def png(w, h, raw):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))


def ico(images):
    header = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries, blobs = b"", b""
    for size, data in images:
        dim = 0 if size >= 256 else size
        entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)
    return header + entries + blobs


if __name__ == "__main__":
    sizes = [256, 64, 48, 32, 16]
    out = ROOT / "assets" / "icon.ico"
    out.write_bytes(ico([(s, render(s)) for s in sizes]))
    (ROOT / "assets" / "icon-256.png").write_bytes(render(256))
    # sizes the web app manifest asks for
    (ROOT / "assets" / "icon-192.png").write_bytes(render(192, ss=3))
    (ROOT / "assets" / "icon-512.png").write_bytes(render(512, ss=2))
    print(f"wrote {out.relative_to(ROOT)} + png icons")
