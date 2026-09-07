#!/usr/bin/env python3
"""Generate the app icons.

No image library is available (and pulling one in for four PNGs would be silly), so this
draws the cart with plain pixel math and writes the PNGs with zlib. Committing the
generator rather than only the output means the icons can be regenerated or tweaked
without hunting for the original artwork.

Usage: python3 scripts/generate-icons.py
"""

import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "apps" / "web" / "public"

BACKGROUND = (26, 93, 58)      # deep green
GLYPH = (247, 246, 241)        # off-white
SUPERSAMPLE = 4                # 4x4 samples per pixel, for smooth edges

# The cart, in normalized 0..1 coordinates.
STROKE = 0.052
HANDLE = [(0.14, 0.24), (0.26, 0.24), (0.34, 0.40)]
BASKET = [(0.32, 0.36), (0.88, 0.36), (0.76, 0.64), (0.44, 0.64)]
WHEELS = [(0.50, 0.79), (0.72, 0.79)]
WHEEL_RADIUS = 0.062


def distance_to_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    length_squared = dx * dx + dy * dy
    if length_squared == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_squared))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def is_glyph(x, y):
    """True when the normalized point falls on the cart."""
    half = STROKE / 2

    for i in range(len(HANDLE) - 1):
        if distance_to_segment(x, y, *HANDLE[i], *HANDLE[i + 1]) <= half:
            return True

    for i in range(len(BASKET)):
        a, b = BASKET[i], BASKET[(i + 1) % len(BASKET)]
        if distance_to_segment(x, y, *a, *b) <= half:
            return True

    for cx, cy in WHEELS:
        if math.hypot(x - cx, y - cy) <= WHEEL_RADIUS:
            return True

    return False


def render(size):
    rows = []
    step = 1.0 / (size * SUPERSAMPLE)
    for py in range(size):
        row = bytearray()
        for px in range(size):
            hits = 0
            for sy in range(SUPERSAMPLE):
                for sx in range(SUPERSAMPLE):
                    nx = (px * SUPERSAMPLE + sx + 0.5) * step
                    ny = (py * SUPERSAMPLE + sy + 0.5) * step
                    if is_glyph(nx, ny):
                        hits += 1
            coverage = hits / (SUPERSAMPLE * SUPERSAMPLE)
            for channel in range(3):
                value = BACKGROUND[channel] + (GLYPH[channel] - BACKGROUND[channel]) * coverage
                row.append(int(round(value)))
        rows.append(bytes(row))
    return rows


def write_png(path, size):
    raw = b"".join(b"\x00" + row for row in render(size))

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)
    print(f"{path.relative_to(path.parent.parent.parent.parent)}  {size}x{size}  {len(png):,}b")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    write_png(OUT / "icon-192.png", 192)
    write_png(OUT / "icon-512.png", 512)
    # iOS uses this one for the home screen; it applies its own rounded mask.
    write_png(OUT / "apple-touch-icon.png", 180)
    write_png(OUT / "favicon-32.png", 32)
