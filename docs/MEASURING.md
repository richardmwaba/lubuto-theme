# Measuring

How Lubuto's effects are costed on the reference machine, and the numbers behind the shipped defaults.

## Machine

| | |
| --- | --- |
| Shell | GNOME Shell 50.5, mutter 50.5, Fedora 44, Wayland |
| GPUs | NVIDIA GTX 1650 (mutter primary through `/etc/udev/rules.d/61-mutter-primary-gpu.rules`), Intel UHD 630 on eDP-1 |
| Displays | 3440x1440 at 60 Hz on HDMI-1 through NVIDIA, 1920x1080 eDP-1 on Intel |
| Theme | Lubuto-Teal-Dark-Compact, extension defaults unless a row says otherwise |

To make Intel primary, move the udev rule aside and log out and in:

```sh
sudo mv /etc/udev/rules.d/61-mutter-primary-gpu.rules /root/
```

Put it back the same way to return to NVIDIA.

## Tools

- `tools/measure.sh <label> [seconds]` samples `nvidia-smi dmon` once a second and the gnome-shell
  process CPU over the window, writes `build/measure/<label>.gpu.txt` and a line in
  `build/measure/summary.txt`, and records the window's start and end in `build/measure/windows.txt`.
- `sysprof-cli --gnome-shell --no-perf <file>` records the shell's own profiler marks. `sysprofd` asks for
  authentication on every capture, so start one capture around a run and set `MEASURE_SHARED_CAPTURE=1`
  for `measure.sh`, which then records window boundaries instead of starting its own capture. Do not pass
  `-f`: with it the capture came back without shell marks.
- `tools/measure-frames.py <capture> build/measure/windows.txt` counts, per window, the
  `Clutter::FrameClock::dispatch()` marks (frames), the `presented()` marks, the frames over 16.7 ms and
  the worst one.
- Settings toggle live, so each effect is measured by flipping its key and sampling again:

  ```sh
  dconf write /org/gnome/shell/extensions/lubuto/blur-enabled false
  dconf reset /org/gnome/shell/extensions/lubuto/blur-enabled
  ```

- Cues for the person at the screen: a banner over the session bus (`gdbus call ... org.freedesktop.Notifications.Notify`;
  `notify-send` goes through the portal and showed nothing) and `canberra-gtk-play -i complete`.
  `org.gnome.Shell.ShowOSD` is refused for unprivileged callers.

## Protocol

Idle: an empty workspace, nothing animating on any display, no terminal in view, 25 s to settle before
sampling. A blinking cursor is a repaint every frame and the glass backdrops re-blur behind it, and the
workspace switch itself shows up for several seconds.

Interaction set, 40 s, the same choreography for every row, with a VS Code window and a Firefox window on
the workspace:

1. Open and close the calendar, three times.
2. Open and close quick settings, twice.
3. Enter and leave the overview, three times.
4. Alt-Tab to the other window and back, twice.
5. Drag a window around for three seconds.
6. Switch workspace and back, twice.

Every row is one run of the sampler. GPU numbers are NVIDIA SM busy; the Intel GPU has no sampler
installed (`intel_gpu_top` is in `igt-gpu-tools`).

## Results

Date: 2026-10-12, NVIDIA primary. Means over the window; max in brackets.

### Idle, 20 s

| Setup | GPU SM | Shell CPU | Frames | Slow frames |
| --- | --- | --- | --- | --- |
| all on | 5% (6%) | 2% | 22 | 0 |
| blur off | 5% (6%) | 1% | 23 | 0 |
| dock blur off | 5% (7%) | 1% | 24 | 0 |
| panel blur off | 5% (7%) | 2% | 23 | 1 |

About one frame a second at idle, the panel clock, whatever is on. The backdrops repaint only when
something under them changes. An earlier all-on row read 246 frames and 7% GPU because sampling started
while the workspace switch was still settling; the row above replaced it after a 25 s settle.

### Interaction set, 40 s

| Setup | GPU SM | Shell CPU | Frames dispatched | Presented | Slow frames | Worst |
| --- | --- | --- | --- | --- | --- | --- |
| all on | 18% (37%) | 26% | 2098 | 1642 | 26 | 51.9 ms |
| blur off | 16% (43%) | 26% | 3361 | 1751 | 26 | 48.5 ms |
| wobble off | 16% (37%) | 23% | 1983 | 1611 | 31 | 51.4 ms |
| move off | 18% (39%) | 26% | 2080 | 1614 | 31 | 55.4 ms |
| corners off | 17% (37%) | 27% | 2275 | 1734 | 38 | 50.9 ms |
| dock off | 17% (35%) | 23% | 1863 | 1441 | 38 | 43.2 ms |

Slow frames sit between 26 and 38 in every row, whichever effect is off, so they come from the shell's
own overview and workspace animations at 3440x1440, not from an effect. Each effect costs at most two
points of GPU or three of shell CPU while it is in use.

## Decisions

| Effect | Cost | Default |
| --- | --- | --- |
| Blur, all surfaces | 2 points GPU during the set, nothing at idle | On |
| Wobble | 3 points shell CPU and 2 GPU while dragging | On |
| Translucent move | Not measurable | On |
| Corners and shadow | Not measurable | On |
| Dock | 3 points shell CPU during the set | On |

Animation durations stay at 75 ms, 100 ms and 150 ms (`$duration`, `$shorter-duration`,
`$longer-duration`), which is already shorter than GNOME's 200 ms and reads as the macOS pace.

Not measured: Intel as primary GPU. It needs the udev rule moved and a new login, and the reference setup
runs NVIDIA primary by decision. Redo the table above after that switch if the rule ever changes.
