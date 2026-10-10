REPO_DIR="$(dirname "$(readlink -m "${0}")")"
SRC_DIR="$REPO_DIR/src"

ROOT_UID=0
DEST_DIR=

MY_USERNAME="${SUDO_USER:-$(logname 2> /dev/null || echo "${USER}")}"
MY_HOME=$(getent passwd "${MY_USERNAME}" | cut -d: -f6)

# Destination directory
if [[ "$UID" -eq "$ROOT_UID" ]]; then
  DEST_DIR="/usr/share/themes"
elif [[ -n "$XDG_DATA_HOME" ]]; then
  DEST_DIR="$XDG_DATA_HOME/themes"
elif [[ -d "$HOME/.themes" ]]; then
  DEST_DIR="$HOME/.themes"
elif [[ -d "$HOME/.local/share/themes" ]]; then
  DEST_DIR="$HOME/.local/share/themes"
else
  DEST_DIR="$HOME/.themes"
fi

SASS_OPT=(--no-source-map --style=expanded --quiet)

THEME_NAME=Lubuto
THEME_VARIANTS=('' '-Purple' '-Pink' '-Red' '-Orange' '-Yellow' '-Green' '-Teal' '-Grey')
COLOR_VARIANTS=('' '-Light' '-Dark')
SIZE_VARIANTS=('' '-Compact')

ctype=
icon='-default'

# Check command availability
function has_command() {
  command -v "$1" > /dev/null
}

# Dart Sass (sass-embedded, the native compiler). package.json pins the version; a global `sass` is the fallback.
find_sass() {
  if [[ -x "$REPO_DIR/node_modules/.bin/sass" ]]; then
    SASS="$REPO_DIR/node_modules/.bin/sass"
  elif has_command sass; then
    SASS="$(command -v sass)"
  elif has_command npm; then
    echo "Installing the pinned Dart Sass from package.json..."
    (cd "$REPO_DIR" && npm ci --no-audit --no-fund --silent) || (cd "$REPO_DIR" && npm install --no-audit --no-fund --silent)
    SASS="$REPO_DIR/node_modules/.bin/sass"
  fi

  if [[ -z "${SASS:-}" || ! -x "$SASS" ]]; then
    echo "Dart Sass is required. Install node and npm, or install 'sass' globally."
    exit 1
  fi
}

compile_scss() {
  "$SASS" "${SASS_OPT[@]}" "$1" "$2"
}

# Icon theme that matches the accent colour, for index.theme metadata only.
icon_theme_for() {
  case "$1" in
    '') echo "Hatter-Blue" ;;
    -Grey) echo "Hatter-Slate" ;;
    *) echo "Hatter${1}" ;;
  esac
}

install() {
  local dest="$1"
  local name="$2"
  local theme="$3"
  local color="$4"
  local size="$5"
  local ctype="$6"
  local icon="$7"

  if [[ "$color" == '-Dark' ]]; then
    local ELSE_DARK="$color"
  fi

  local THEME_DIR="${1}/${2}${3}${4}${5}${6}"

  [[ -d "$THEME_DIR" ]] && rm -rf "$THEME_DIR"

  theme_tweaks && install_theme_color

  echo "Installing '$THEME_DIR'..."

  mkdir -p                                                                                   "$THEME_DIR"
  cp -r "$REPO_DIR/COPYING"                                                                  "$THEME_DIR"

  cat > "$THEME_DIR/index.theme" <<INDEX
[Desktop Entry]
Type=X-GNOME-Metatheme
Name=${2}${3}${4}${5}${6}
Comment=Lubuto, a Liquid Glass theme for GNOME 50 based on Orchis
Encoding=UTF-8

[X-GNOME-Metatheme]
GtkTheme=${2}${3}${4}${5}${6}
MetacityTheme=${2}${3}${4}${5}${6}
IconTheme=$(icon_theme_for "$theme")
CursorTheme=Bibata-Modern-Ice
ButtonLayout=close,minimize,maximize:menu
INDEX

  mkdir -p                                                                                   "$THEME_DIR/gnome-shell"
  cp -r "$SRC_DIR/gnome-shell/pad-osd.css"                                                   "$THEME_DIR/gnome-shell"
  compile_scss "$SRC_DIR/gnome-shell/shell-50/gnome-shell${ELSE_DARK:-}$size.scss"           "$THEME_DIR/gnome-shell/gnome-shell.css"

  cp -r "$SRC_DIR/gnome-shell/common-assets"                                                 "$THEME_DIR/gnome-shell/assets"
  cp -r "$SRC_DIR/gnome-shell/assets${ELSE_DARK:-}/"*.svg                                    "$THEME_DIR/gnome-shell/assets"

  if [[ "$primary" == 'true' ]]; then
    cp -r "$SRC_DIR/gnome-shell/theme$theme$ctype/checkbox${ELSE_DARK:-}.svg"                "$THEME_DIR/gnome-shell/assets/checkbox.svg"
  fi

  cp -r "$SRC_DIR/gnome-shell/theme$theme$ctype/more-results${ELSE_DARK:-}.svg"              "$THEME_DIR/gnome-shell/assets/more-results.svg"
  cp -r "$SRC_DIR/gnome-shell/theme$theme$ctype/toggle-on${ELSE_DARK:-}.svg"                 "$THEME_DIR/gnome-shell/assets/toggle-on.svg"

  cp -r "$SRC_DIR/gnome-shell/activities/activities${icon}.svg"                              "$THEME_DIR/gnome-shell/assets/activities.svg"

  (
    cd "$THEME_DIR/gnome-shell"
    ln -s assets/no-events.svg no-events.svg
    ln -s assets/process-working.svg process-working.svg
    ln -s assets/no-notifications.svg no-notifications.svg
  )

  mkdir -p                                                                                   "$THEME_DIR/gtk-3.0"
  cp -r "$SRC_DIR/gtk/assets$theme$ctype"                                                    "$THEME_DIR/gtk-3.0/assets"
  cp -r "$SRC_DIR/gtk/scalable"                                                              "$THEME_DIR/gtk-3.0/assets"
  cp -r "$SRC_DIR/gtk/thumbnails/thumbnail$theme${ELSE_DARK:-}$ctype.png"                    "$THEME_DIR/gtk-3.0/thumbnail.png"
  compile_scss "$SRC_DIR/gtk/3.0/gtk$color$size.scss"                                        "$THEME_DIR/gtk-3.0/gtk.css"
  compile_scss "$SRC_DIR/gtk/3.0/gtk-Dark$size.scss"                                         "$THEME_DIR/gtk-3.0/gtk-dark.css"

  mkdir -p                                                                                   "$THEME_DIR/gtk-4.0"
  cp -r "$SRC_DIR/gtk/assets$theme$ctype"                                                    "$THEME_DIR/gtk-4.0/assets"
  cp -r "$SRC_DIR/gtk/scalable"                                                              "$THEME_DIR/gtk-4.0/assets"
  compile_scss "$SRC_DIR/gtk/4.0/gtk$color$size.scss"                                        "$THEME_DIR/gtk-4.0/gtk.css"
  compile_scss "$SRC_DIR/gtk/4.0/gtk-Dark$size.scss"                                         "$THEME_DIR/gtk-4.0/gtk-dark.css"
}

uninstall() {
  local dest="$1"
  local name="$2"
  local theme="$3"
  local color="$4"
  local size="$5"
  local ctype="$6"

  local THEME_DIR="${1}/${2}${3}${4}${5}${6}"

  [[ -d "$THEME_DIR" ]] && rm -rf "$THEME_DIR" && echo -e "Uninstalling '$THEME_DIR'..."
}

uninstall_link() {
  rm -rf "${HOME}/.config/gtk-4.0/"{assets,gtk.css,gtk-dark.css}
  echo -e "\nRemoving ${HOME}/.config/gtk-4.0 links..."
}

link_libadwaita() {
  local dest="$1"
  local name="$2"
  local theme="$3"
  local color="$4"
  local size="$5"
  local ctype="$6"

  local THEME_DIR="${1}/${2}${3}${4}${5}${6}"

  echo -e "\nLink '$THEME_DIR/gtk-4.0' to '${HOME}/.config/gtk-4.0' for libadwaita..."

  [[ ! -d "${HOME}/.config/gtk-4.0" ]] && mkdir -p                              "${HOME}/.config/gtk-4.0"
  rm -rf "${HOME}/.config/gtk-4.0/"{assets,gtk.css,gtk-dark.css}
  ln -sf "${THEME_DIR}/gtk-4.0/assets"                                          "${HOME}/.config/gtk-4.0/assets"
  ln -sf "${THEME_DIR}/gtk-4.0/gtk.css"                                         "${HOME}/.config/gtk-4.0/gtk.css"
  ln -sf "${THEME_DIR}/gtk-4.0/gtk-dark.css"                                    "${HOME}/.config/gtk-4.0/gtk-dark.css"
}

tweaks_temp() {
  cp -rf "$SRC_DIR/_sass/_tweaks.scss" "$SRC_DIR/_sass/_tweaks-temp.scss"
}

change_radio_color() {
  sed -i "/\$check_radio:/s/default/primary/" "$SRC_DIR/_sass/_tweaks-temp.scss"
}

install_compact_panel() {
  sed -i "/\$panel_style:/s/float/compact/" "$SRC_DIR/_sass/_tweaks-temp.scss"
}

install_solid() {
  sed -i "/\$opacity:/s/default/solid/" "$SRC_DIR/_sass/_tweaks-temp.scss"
}

install_black() {
  sed -i "/\$blackness:/s/false/true/" "$SRC_DIR/_sass/_tweaks-temp.scss"
}

install_mac() {
  sed -i "/\$mac_style:/s/false/true/" "$SRC_DIR/_sass/_tweaks-temp.scss"
}

round_corner() {
  sed -i "/\$default_corner:/s/12px/${corner}/" "$SRC_DIR/_sass/_tweaks-temp.scss"
}

install_submenu() {
  sed -i "/\$submenu_style:/s/false/true/" "$SRC_DIR/_sass/_tweaks-temp.scss"
}

install_nord() {
  sed -i "/\@import/s/color-palette-default/color-palette-nord/" "$SRC_DIR/_sass/_tweaks-temp.scss"
  sed -i "/\$colorscheme:/s/default/nord/" "$SRC_DIR/_sass/_tweaks-temp.scss"
}

install_dracula() {
  sed -i "/\@import/s/color-palette-default/color-palette-dracula/" "$SRC_DIR/_sass/_tweaks-temp.scss"
  sed -i "/\$colorscheme:/s/default/dracula/" "$SRC_DIR/_sass/_tweaks-temp.scss"
}

activities_style() {
  sed -i "/\$activities:/s/normal/icon/" "$SRC_DIR/_sass/_tweaks-temp.scss"
}

accent_type() {
  sed -i "/\$accent_type:/s/default/fixed/" "$SRC_DIR/_sass/_tweaks-temp.scss"
}

install_theme_color() {
  if [[ "$theme" != '' ]]; then
    case "$theme" in
      -Purple) theme_color='purple' ;;
      -Pink)   theme_color='pink' ;;
      -Red)    theme_color='red' ;;
      -Orange) theme_color='orange' ;;
      -Yellow) theme_color='yellow' ;;
      -Green)  theme_color='green' ;;
      -Teal)   theme_color='teal' ;;
      -Grey)   theme_color='grey' ;;
    esac
    sed -i "/\$theme:/s/default/${theme_color}/" "$SRC_DIR/_sass/_tweaks-temp.scss"
  fi
}

theme_tweaks() {
  find_sass; tweaks_temp

  if [[ "$panel" == "compact" ]] ; then
    install_compact_panel
  fi

  if [[ "$opacity" == "solid" ]] ; then
    install_solid
  fi

  if [[ "$blackness" == "true" ]] ; then
    install_black
  fi

  if [[ "$primary" == "true" ]] ; then
    change_radio_color
  fi

  if [[ "$round" == "true" ]] ; then
    round_corner
  fi

  if [[ "$macstyle" == "true" ]] ; then
    install_mac
  fi

  if [[ "$submenu" == "true" ]] ; then
    install_submenu
  fi

  if [[ "$nord" == "true" ]] ; then
    install_nord
  fi

  if [[ "$dracula" == "true" ]] ; then
    install_dracula
  fi

  if [[ "$activities" = "icon" ]] ; then
    activities_style
  fi

  if [[ "$fixed" = "true" || "$dracula" == "true" || "$nord" == "true" ]] ; then
    accent_type
  fi
}

check_shell() {
  if has_command gnome-shell; then
    local version
    version="$(gnome-shell --version | cut -d ' ' -f 3 | cut -d . -f 1)"
    if [[ "${version:-0}" -lt 50 ]]; then
      echo "Lubuto targets GNOME Shell 50 or later. Found $(gnome-shell --version)."
      echo "The theme installs anyway, but the shell stylesheet is untested on this version."
    fi
  else
    echo "'gnome-shell' not found. Installing the GTK theme and the GNOME 50 shell stylesheet anyway."
  fi
}

install_theme() {
  check_shell

  for theme in "${themes[@]}"; do
    for color in "${colors[@]}"; do
      for size in "${sizes[@]}"; do
        install "${dest:-$DEST_DIR}" "${_name:-$THEME_NAME}" "$theme" "$color" "$size" "$ctype" "$icon"
      done
    done
  done
}

uninstall_theme() {
  for theme in "${THEME_VARIANTS[@]}"; do
    for color in "${COLOR_VARIANTS[@]}"; do
      for size in "${SIZE_VARIANTS[@]}"; do
        for scheme in '' '-Nord' '-Dracula'; do
          uninstall "${dest:-$DEST_DIR}" "${_name:-$THEME_NAME}" "$theme" "$color" "$size" "$scheme"
        done
      done
    done
  done
}

clean_theme() {
  if [[ "$DEST_DIR" == "$HOME/.themes" ]]; then
    local dest="$HOME/.local/share/themes"

    for theme in "${themes[@]}"; do
      for color in "${colors[@]}"; do
        for size in "${sizes[@]}"; do
          uninstall "${dest}" "${_name:-$THEME_NAME}" "$theme" "$color" "$size" "$ctype"
        done
      done
    done
  fi
}

link_theme() {
  for theme in "${themes[@]}"; do
    for color in "${lcolors[@]}"; do
      for size in "${sizes[0]}"; do
        link_libadwaita "${dest:-$DEST_DIR}" "${_name:-$THEME_NAME}" "$theme" "$color" "$size" "$ctype"
      done
    done
  done
}
