#!/usr/bin/env bash
# Packs the extension into a zip that `gnome-extensions install` accepts.
# Output: build/lubuto@richardmwaba.github.io.shell-extension.zip

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_DIR="$REPO_DIR/extension"
OUT_DIR="$REPO_DIR/build"

mkdir -p "$OUT_DIR"

gnome-extensions pack --force \
  --schema="$EXT_DIR/schemas/org.gnome.shell.extensions.lubuto.gschema.xml" \
  --extra-source="$EXT_DIR/src" \
  --out-dir="$OUT_DIR" \
  "$EXT_DIR"

echo "$OUT_DIR/lubuto@richardmwaba.github.io.shell-extension.zip"
