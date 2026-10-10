#!/bin/bash
# Compiles every stylesheet variant in place, next to its .scss entry file.
# CI runs this with FATAL_DEPRECATIONS set so deprecated Sass fails the build.

REPO_DIR="$(dirname "$(readlink -m "${0}")")"

if [[ -x "$REPO_DIR/node_modules/.bin/sass" ]]; then
  SASS="$REPO_DIR/node_modules/.bin/sass"
elif command -v sass > /dev/null; then
  SASS="$(command -v sass)"
else
  echo "Dart Sass is required. Run 'npm ci' in the repo or install 'sass' globally."
  exit 1
fi

SASS_OPT=(--no-source-map --style=expanded)

if [[ -n "${FATAL_DEPRECATIONS:-}" ]]; then
  SASS_OPT+=(--fatal-deprecation="$FATAL_DEPRECATIONS")
fi

_COLOR_VARIANTS=('' '-Light' '-Dark')
_GCOLOR_VARIANTS=('' '-Dark')
_SIZE_VARIANTS=('' '-Compact')

if [[ -n "${COLOR_VARIANTS:-}" ]]; then
  IFS=', ' read -r -a _COLOR_VARIANTS <<< "${COLOR_VARIANTS:-}"
fi

if [[ -n "${GCOLOR_VARIANTS:-}" ]]; then
  IFS=', ' read -r -a _GCOLOR_VARIANTS <<< "${GCOLOR_VARIANTS:-}"
fi

if [[ -n "${SIZE_VARIANTS:-}" ]]; then
  IFS=', ' read -r -a _SIZE_VARIANTS <<< "${SIZE_VARIANTS:-}"
fi

cp -rf "$REPO_DIR/src/_sass/_tweaks.scss" "$REPO_DIR/src/_sass/_tweaks-temp.scss"

echo "== Generating the CSS..."

for color in "${_COLOR_VARIANTS[@]}"; do
  for size in "${_SIZE_VARIANTS[@]}"; do
    "$SASS" "${SASS_OPT[@]}" "$REPO_DIR/src/gtk/3.0/gtk$color$size."{scss,css} || exit 1
    "$SASS" "${SASS_OPT[@]}" "$REPO_DIR/src/gtk/4.0/gtk$color$size."{scss,css} || exit 1
  done
done

for color in "${_GCOLOR_VARIANTS[@]}"; do
  for size in "${_SIZE_VARIANTS[@]}"; do
    "$SASS" "${SASS_OPT[@]}" "$REPO_DIR/src/gnome-shell/shell-50/gnome-shell$color$size."{scss,css} || exit 1
  done
done

echo "== done!"
