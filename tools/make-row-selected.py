#!/usr/bin/env python3
"""Generate the graphite `row-selected` assets from the grey and black ones.

The selected sidebar row in GTK apps paints a 9-slice PNG whose opaque pill
is the palette's `$base` colour, so each surface shade needs its own PNG.
The grey and black PNGs are drawn by hand; the graphite pill is the same
mix of the two that `_colors.scss` uses for the graphite palette, so the
PNG follows the stylesheet without a third hand-drawn set.

Usage: tools/make-row-selected.py [--ratio 0.5] [src/gtk/assets-*]
"""

import argparse
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent


def mix(a, b, ratio):
    return tuple(round(a[i] * ratio + b[i] * (1 - ratio)) for i in range(4))


def generate(assets, ratio):
    for grey in sorted(assets.glob('row-selected*.png')):
        if '-blackness' in grey.name or '-graphite' in grey.name:
            continue
        black = grey.with_name(grey.name.replace('row-selected', 'row-selected-blackness', 1))
        if not black.exists():
            print(f'{grey}: no -blackness sibling', file=sys.stderr)
            continue
        out = grey.with_name(grey.name.replace('row-selected', 'row-selected-graphite', 1))
        a = Image.open(grey).convert('RGBA')
        b = Image.open(black).convert('RGBA')
        if a.size != b.size:
            print(f'{grey}: size differs from {black.name}', file=sys.stderr)
            continue
        pa, pb = a.load(), b.load()
        result = Image.new('RGBA', a.size)
        pr = result.load()
        for y in range(a.height):
            for x in range(a.width):
                # Only the opaque pill is the palette colour; the translucent
                # accent tint around it is the same in both sources.
                pr[x, y] = mix(pb[x, y], pa[x, y], ratio) if pa[x, y][3] == 255 else pa[x, y]
        result.save(out)
        print(out.relative_to(ROOT))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--ratio', type=float, default=0.5, help='share of the black pill in the mix, default 0.5')
    parser.add_argument('dirs', nargs='*', type=pathlib.Path, help='asset directories, default src/gtk/assets-*')
    args = parser.parse_args()
    dirs = args.dirs or sorted((ROOT / 'src' / 'gtk').glob('assets*'))
    for d in dirs:
        generate(d, args.ratio)


if __name__ == '__main__':
    main()
