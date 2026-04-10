"""
Remove solid / checker-style backgrounds via edge flood-fill (RGBA PNG).
- White / near-white outer padding (single sprites)
- Neutral gray outer padding (spritesheets exported with gray instead of alpha)
"""
from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

from PIL import Image


def flood_transparent_rgba(
    im: Image.Image,
    seed_predicate,
    neighbor_predicate,
) -> Image.Image:
    w, h = im.size
    px = im.load()
    out = im.copy()
    opx = out.load()
    seen = bytearray(w * h)

    def idx(x: int, y: int) -> int:
        return y * w + x

    q: deque[tuple[int, int]] = deque()

    for x in range(w):
        for y in (0, h - 1):
            if seed_predicate(px[x, y][:3]):
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if seed_predicate(px[x, y][:3]):
                q.append((x, y))

    while q:
        x, y = q.popleft()
        i = idx(x, y)
        if seen[i]:
            continue
        seen[i] = 1
        r, g, b, _a = px[x, y]
        opx[x, y] = (r, g, b, 0)

        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or nx >= w or ny < 0 or ny >= h:
                continue
            if seen[idx(nx, ny)]:
                continue
            nr, ng, nb = px[nx, ny][:3]
            if neighbor_predicate(r, g, b, nr, ng, nb):
                q.append((nx, ny))

    return out


def remove_white_padding(path: Path) -> None:
    im = Image.open(path).convert("RGBA")

    def seed(rgb: tuple[int, int, int]) -> bool:
        r, g, b = rgb
        return r >= 248 and g >= 248 and b >= 248

    def neigh(_r, _g, _b, nr, ng, nb) -> bool:
        return nr >= 245 and ng >= 245 and nb >= 245

    out = flood_transparent_rgba(im, seed, neigh)
    out.save(path, "PNG")
    print(f"white-edge removal: {path}")


def remove_gray_checker_padding(path: Path) -> None:
    im = Image.open(path).convert("RGBA")
    w, h = im.size

    def is_gray_bg(rgb: tuple[int, int, int]) -> bool:
        r, g, b = rgb
        if max(r, g, b) - min(r, g, b) > 38:
            return False
        return 70 <= r <= 175 and 70 <= g <= 175 and 70 <= b <= 175

    def seed(rgb: tuple[int, int, int]) -> bool:
        return is_gray_bg(rgb)

    def neigh(r, g, b, nr, ng, nb) -> bool:
        return is_gray_bg((nr, ng, nb))

    out = flood_transparent_rgba(im, seed, neigh)
    out.save(path, "PNG")
    print(f"gray-edge removal: {path}")


def main() -> None:
    if len(sys.argv) < 3:
        print(
            "Usage: python remove_png_background.py <white|gray> <path.png> [path2.png ...]",
            file=sys.stderr,
        )
        sys.exit(1)
    mode = sys.argv[1]
    paths = [Path(p) for p in sys.argv[2:]]
    for p in paths:
        if not p.is_file():
            print(f"skip (not found): {p}", file=sys.stderr)
            continue
        if mode == "white":
            remove_white_padding(p)
        elif mode == "gray":
            remove_gray_checker_padding(p)
        else:
            print("mode must be 'white' or 'gray'", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
