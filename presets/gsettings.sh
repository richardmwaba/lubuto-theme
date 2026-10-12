#!/usr/bin/env bash
# Font and rendering keys for the Lubuto crisp preset.
#
# Usage: gsettings.sh apply|undo|show
#
# apply  writes the keys below and saves the previous values to an undo script.
# undo   runs that script and removes it.
# show   prints the current values next to the preset.
#
# Sizes match the shell stylesheet: the shell root font is 14 px, which is
# 10.5 pt at 96 dpi, so GTK text set at 10.5 pt renders at the same size.

set -euo pipefail

# A terminal inside a snap (VS Code, for one) points GSettings at the snap's
# own schemas and GIO modules, where the GNOME 44+ font keys do not exist.
# Drop those so gsettings reads the system schemas.
unset GSETTINGS_SCHEMA_DIR GIO_MODULE_DIR GIO_EXTRA_MODULES GTK_PATH GTK_EXE_PREFIX LOCPATH
XDG_DATA_DIRS="/usr/local/share:/usr/share:$(tr ':' '\n' <<< "${XDG_DATA_DIRS:-}" | grep -v '/snap/' | paste -sd: -)"
export XDG_DATA_DIRS

SCHEMA=org.gnome.desktop.interface
UNDO="${XDG_CONFIG_HOME:-$HOME/.config}/lubuto/fonts-undo.sh"

KEYS=(font-name document-font-name monospace-font-name font-hinting font-antialiasing)
declare -A PRESET=(
  [font-name]="'Inter 10.5'"
  [document-font-name]="'Inter 11'"
  [monospace-font-name]="'JetBrains Mono 10'"
  [font-hinting]="'slight'"
  [font-antialiasing]="'grayscale'"
)

# gsettings on some machines logs a libproxy warning from a snap on stderr;
# the exit status and stdout are what matter here.
get() { gsettings get "$SCHEMA" "$1" 2> /dev/null; }
set_key() { gsettings set "$SCHEMA" "$1" "$2" 2> /dev/null; }

# A key still at its schema default has no entry in dconf.
is_default() { [[ -z "$(dconf read "/org/gnome/desktop/interface/$1")" ]]; }

warn_missing_font() {
  local family="$1"
  # grep reads to the end: with pipefail, -q would kill fc-list mid-write.
  if ! fc-list : family | grep -x "$family" > /dev/null; then
    echo "Warning: the font '$family' is not installed, so text falls back to the next family."
  fi
}

apply() {
  warn_missing_font Inter
  warn_missing_font "JetBrains Mono"

  mkdir -p "$(dirname "$UNDO")"
  {
    echo '#!/usr/bin/env bash'
    echo '# Restores the font keys that the Lubuto crisp preset replaced.'
    echo "SCHEMA=$SCHEMA"
    for key in "${KEYS[@]}"; do
      if is_default "$key"; then
        echo "gsettings reset \"\$SCHEMA\" $key 2> /dev/null"
      else
        echo "gsettings set \"\$SCHEMA\" $key \"$(get "$key")\" 2> /dev/null"
      fi
    done
  } > "$UNDO"
  chmod +x "$UNDO"

  for key in "${KEYS[@]}"; do
    set_key "$key" "${PRESET[$key]}"
    printf '  %-22s %s\n' "$key" "${PRESET[$key]}"
  done

  local ini="${XDG_CONFIG_HOME:-$HOME/.config}/gtk-4.0/settings.ini"
  if [[ -f "$ini" ]] && grep -Eq '^\s*gtk-hint-font-metrics\s*=\s*(1|true)' "$ini"; then
    echo "Warning: $ini sets gtk-hint-font-metrics, which snaps glyphs to whole pixels. Remove it for fractional positioning."
  fi

  echo "Undo with: $UNDO"
}

undo() {
  if [[ ! -x "$UNDO" ]]; then
    echo "No undo script at $UNDO; the preset was not applied."
    return 0
  fi
  "$UNDO"
  rm -f "$UNDO"
  echo "Restored the previous font keys."
}

show() {
  printf '  %-22s %-24s %s\n' key current preset
  for key in "${KEYS[@]}"; do
    printf '  %-22s %-24s %s\n' "$key" "$(get "$key")" "${PRESET[$key]}"
  done
}

case "${1:-}" in
  apply) apply ;;
  undo) undo ;;
  show) show ;;
  *)
    echo "Usage: $0 apply|undo|show"
    exit 1
    ;;
esac
