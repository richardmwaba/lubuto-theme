#!/usr/bin/env bash
# Samples GPU busy and gnome-shell CPU for a labelled window of time, and
# records a sysprof capture of the shell when sysprof-cli is installed.
#
# Usage: measure.sh <label> [seconds]
#
# Output goes to build/measure/<label>.*: the raw nvidia-smi samples, the
# sysprof capture, and a one-line summary that is also printed. Run it, then
# perform the interaction set from docs/MEASURING.md while it samples.

set -euo pipefail

label="${1:?label}"
seconds="${2:-25}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$REPO_DIR/build/measure"
mkdir -p "$out"

shell_pid="$(pgrep -x gnome-shell | head -1)"
ticks="$(getconf CLK_TCK)"
shell_cpu() { awk '{print $14 + $15}' "/proc/$shell_pid/stat"; }

# sysprofd asks for authentication on every capture, so a sequence of runs
# shares one capture started by the caller (MEASURE_SHARED_CAPTURE=1) and
# this records the window boundaries in the capture's clock for
# tools/measure-frames.py to cut it up.
if [[ -z "${MEASURE_SHARED_CAPTURE:-}" ]] && command -v sysprof-cli > /dev/null; then
  sysprof-cli --gnome-shell --no-perf -f "$out/$label.syscap" > /dev/null 2>&1 &
  sysprof_pid=$!
fi
mono() { python3 -c 'import time; print(time.monotonic_ns())'; }

cpu_start="$(shell_cpu)"
mono_start="$(mono)"
nvidia-smi dmon -s u -d 1 -c "$seconds" > "$out/$label.gpu.txt" 2>&1 || true
mono_end="$(mono)"
cpu_end="$(shell_cpu)"
echo "$label $mono_start $mono_end" >> "$out/windows.txt"

if [[ -n "${sysprof_pid:-}" ]]; then
  kill -INT "$sysprof_pid" 2> /dev/null || true
  wait "$sysprof_pid" 2> /dev/null || true
fi

summary="$(awk -v label="$label" -v cpu="$(( (cpu_end - cpu_start) * 100 / ticks / seconds ))" '
  $1 ~ /^[0-9]+$/ { n++; sm += $2; mem += $3; if ($2 > smmax) smmax = $2 }
  END { if (n) printf "%-24s gpu sm mean %3d%% max %3d%%  mem mean %3d%%  shell cpu %3d%%  (%d s)\n", label, sm / n, smmax, mem / n, cpu, n }
' "$out/$label.gpu.txt")"
echo "$summary" | tee -a "$out/summary.txt"
