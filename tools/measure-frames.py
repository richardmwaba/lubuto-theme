#!/usr/bin/env python3
"""Counts frames and slow frames per measurement window in a sysprof capture.

Usage: measure-frames.py <capture.syscap> <windows.txt> [frame-ms]

windows.txt holds "label start end" lines in CLOCK_MONOTONIC nanoseconds, as
tools/measure.sh writes them. A frame is one Clutter::FrameClock::dispatch()
mark; it is slow when its duration passes the frame budget (default 16.7 ms,
one frame at 60 Hz). Presented frames come from Clutter::FrameClock::presented().
"""

import re
import subprocess
import sys


def marks(capture):
    text = subprocess.run(['sysprof-cat', capture], capture_output=True, text=True).stdout
    for block in re.finditer(r'mark \{\s*name: "([^"]*)";\s*message: "[^"]*";\s*duration: (\d+);\s*end-time: (\d+);', text):
        name, duration, end = block.groups()
        yield name, int(duration), int(end)


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    capture, windows = sys.argv[1], sys.argv[2]
    budget = float(sys.argv[3]) if len(sys.argv) > 3 else 16.7
    rows = [line.split() for line in open(windows) if line.strip()]
    spans = [(label, int(start), int(end)) for label, start, end in rows]
    stats = {label: {'frames': 0, 'presented': 0, 'slow': 0, 'worst': 0.0} for label, _, _ in spans}

    for name, duration, end in marks(capture):
        start = end - duration
        for label, lo, hi in spans:
            if lo <= start <= hi:
                s = stats[label]
                if name == 'Clutter::FrameClock::dispatch()':
                    ms = duration / 1e6
                    s['frames'] += 1
                    s['worst'] = max(s['worst'], ms)
                    if ms > budget:
                        s['slow'] += 1
                elif name == 'Clutter::FrameClock::presented()':
                    s['presented'] += 1
                break

    print(f'{"window":24} {"frames":>7} {"presented":>9} {"slow":>5} {"worst ms":>9}')
    for label, _, _ in spans:
        s = stats[label]
        print(f'{label:24} {s["frames"]:7} {s["presented"]:9} {s["slow"]:5} {s["worst"]:9.1f}')


if __name__ == '__main__':
    main()
