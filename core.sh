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

install_orchis_buttons() {
  sed -i "/\$mac_style:/s/true/false/" "$SRC_DIR/_sass/_tweaks-temp.scss"
}

install_solid_surfaces() {
  sed -i "/\$glass:/s/true/false/" "$SRC_DIR/_sass/_tweaks-temp.scss"
}

round_corner() {
  sed -i "/\$default_corner:/s/16px/${corner}/" "$SRC_DIR/_sass/_tweaks-temp.scss"
}

install_submenu() {
  sed -i "/\$submenu_style:/s/false/true/" "$SRC_DIR/_sass/_tweaks-temp.scss"
}

install_nord() {
  sed -i "s/color-palette-default/color-palette-nord/" "$SRC_DIR/_sass/_tweaks-temp.scss"
  sed -i "/\$colorscheme:/s/default/nord/" "$SRC_DIR/_sass/_tweaks-temp.scss"
}

install_dracula() {
  sed -i "s/color-palette-default/color-palette-dracula/" "$SRC_DIR/_sass/_tweaks-temp.scss"
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

  if [[ "$orchisbuttons" == "true" ]] ; then
    install_orchis_buttons
  fi

  if [[ "$noglass" == "true" ]] ; then
    install_solid_surfaces
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

# Icons and cursor come from upstream releases pinned in presets/icons.manifest.
# The gsettings keys change only after a confirmation, so an existing choice
# is never replaced silently.

# The Lubuto colour of the first selected theme, as the manifest maps name it.
icons_colour() {
  if [[ "${nord:-}" == "true" ]]; then echo nord; return; fi
  if [[ "${dracula:-}" == "true" ]]; then echo dracula; return; fi
  local theme="${themes[0]:-}"
  theme="${theme#-}"
  [[ -z "$theme" ]] && theme=default
  echo "${theme,,}"
}

# gsettings inside a snap terminal reads the snap's schemas; see presets/gsettings.sh.
clean_gsettings() {
  env -u GSETTINGS_SCHEMA_DIR -u GIO_MODULE_DIR -u GIO_EXTRA_MODULES \
    XDG_DATA_DIRS="/usr/local/share:/usr/share:${XDG_DATA_DIRS:-}" gsettings "$@" 2> /dev/null
}

confirm_gsetting() {
  local key="$1"
  local value="$2"
  local current
  current="$(clean_gsettings get org.gnome.desktop.interface "$key")"
  if [[ "$current" == "'$value'" ]]; then
    echo "$key is already '$value'."
    return 0
  fi
  if [[ -t 0 ]]; then
    read -r -p "Set $key from $current to '$value'? [y/N] " answer
    if [[ "$answer" =~ ^[Yy]$ ]]; then
      clean_gsettings set org.gnome.desktop.interface "$key" "$value"
      echo "Set $key to '$value'."
      return 0
    fi
  fi
  echo "Left $key at $current. To apply: gsettings set org.gnome.desktop.interface $key '$value'"
}

install_icons() {
  if [[ "$UID" == "$ROOT_UID" ]]; then
    echo "Do not run --icons with sudo. Icon themes install per user."
    exit 1
  fi
  local result
  echo -e "\nIcons: $icons for $(icons_colour)..."
  result="$("$REPO_DIR/tools/fetch-icons.sh" "$icons" --colour "$(icons_colour)")" || exit 1
  confirm_gsetting icon-theme "$result"
}

install_cursor() {
  if [[ "$UID" == "$ROOT_UID" ]]; then
    echo "Do not run --cursor with sudo. Cursor themes install per user."
    exit 1
  fi
  local result
  echo -e "\nCursor: bibata-$cursor..."
  result="$("$REPO_DIR/tools/fetch-icons.sh" "bibata-$cursor")" || exit 1
  confirm_gsetting cursor-theme "$result"
}

# Crisp preset: fontconfig snippet plus the gsettings font and rendering keys.
# Per user, like the libadwaita link.
install_fonts() {
  if [[ "$UID" == "$ROOT_UID" ]]; then
    echo "Do not run --fonts with sudo. The preset installs per user."
    exit 1
  fi

  local conf_dir="${XDG_CONFIG_HOME:-$HOME/.config}/fontconfig/conf.d"
  mkdir -p "$conf_dir"
  cp -f "$REPO_DIR/presets/fontconfig/50-lubuto.conf" "$conf_dir/50-lubuto.conf"
  echo -e "\nInstalled $conf_dir/50-lubuto.conf. Apps pick it up when they start."
  "$REPO_DIR/presets/gsettings.sh" apply
  echo "Undo both with: $0 --remove --fonts"
}

uninstall_fonts() {
  rm -f "${XDG_CONFIG_HOME:-$HOME/.config}/fontconfig/conf.d/50-lubuto.conf"
  echo -e "\nRemoved the fontconfig snippet."
  "$REPO_DIR/presets/gsettings.sh" undo
}

# Firefox draws its own window buttons when its title bar is off, so the GTK
# theme never reaches them. A userChrome.css in the profile paints the Lubuto
# buttons instead. Firefox only reads that file with a pref set in user.js.
FIREFOX_PREF='user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);'
FIREFOX_MARK='// Lubuto: userChrome.css needs this.'

# Every Firefox profile root on this machine: package, Flatpak and snap.
firefox_roots() {
  local root
  for root in "$HOME/.mozilla/firefox" "$HOME/.var/app/org.mozilla.firefox/.mozilla/firefox" "$HOME/snap/firefox/common/.mozilla/firefox"; do
    [[ -f "$root/profiles.ini" ]] && echo "$root"
  done
}

# The default profile of a root: the [Install*] section's Default, else the
# profile marked Default=1.
firefox_profile() {
  local root="$1"
  local path
  path="$(awk -F= '/^\[Install/{s=1;next} /^\[/{s=0} s&&$1=="Default"{print $2;exit}' "$root/profiles.ini")"
  if [[ -z "$path" ]]; then
    path="$(awk -F= '/^\[/{p="";d=""} $1=="Path"{p=$2} $1=="Default"&&$2=="1"{print p;exit}' "$root/profiles.ini")"
  fi
  [[ -n "$path" && -d "$root/$path" ]] && echo "$root/$path"
}

install_firefox() {
  if [[ "$UID" == "$ROOT_UID" ]]; then
    echo "Do not run --firefox with sudo. The preset installs per user."
    exit 1
  fi

  local found=false root profile
  for root in $(firefox_roots); do
    profile="$(firefox_profile "$root")" || true
    [[ -z "$profile" ]] && continue
    found=true

    mkdir -p "$profile/chrome"
    if [[ -f "$profile/chrome/userChrome.css" ]] && ! grep -q "Lubuto" "$profile/chrome/userChrome.css"; then
      mv "$profile/chrome/userChrome.css" "$profile/chrome/userChrome.css.lubuto-backup"
      echo "Kept the existing userChrome.css as userChrome.css.lubuto-backup."
    fi
    cp -f "$REPO_DIR/presets/firefox/userChrome.css" "$profile/chrome/userChrome.css"
    if [[ "${nord:-}" == "true" ]]; then
      sed -i 's/#fd5f51/#bf616a/; s/#38c76a/#a3be8c/; s/#fdbe04/#ebcb8b/' "$profile/chrome/userChrome.css"
    elif [[ "${dracula:-}" == "true" ]]; then
      sed -i 's/#fd5f51/#f44d4d/; s/#38c76a/#4be772/; s/#fdbe04/#e8f467/' "$profile/chrome/userChrome.css"
    fi

    if ! grep -qF "$FIREFOX_PREF" "$profile/user.js" 2> /dev/null; then
      printf '%s\n%s\n' "$FIREFOX_MARK" "$FIREFOX_PREF" >> "$profile/user.js"
    fi
    echo -e "\nInstalled the Lubuto window buttons into '$profile'. Restart Firefox, with 'Title Bar' unticked in Customize Toolbar."
  done

  if [[ "$found" == false ]]; then
    echo -e "\nNo Firefox profile found, skipping the Firefox preset."
    return 0
  fi
  echo "Undo with: $0 --remove --firefox"
}

uninstall_firefox() {
  local root profile
  for root in $(firefox_roots); do
    profile="$(firefox_profile "$root")" || true
    [[ -z "$profile" ]] && continue
    if grep -q "Lubuto" "$profile/chrome/userChrome.css" 2> /dev/null; then
      rm -f "$profile/chrome/userChrome.css"
      [[ -f "$profile/chrome/userChrome.css.lubuto-backup" ]] && mv "$profile/chrome/userChrome.css.lubuto-backup" "$profile/chrome/userChrome.css"
    fi
    if [[ -f "$profile/user.js" ]] && grep -qF "$FIREFOX_MARK" "$profile/user.js"; then
      sed -i "/^\/\/ Lubuto: userChrome.css needs this.$/d; /legacyUserProfileCustomizations.stylesheets/d" "$profile/user.js"
      [[ -s "$profile/user.js" ]] || rm -f "$profile/user.js"
    fi
    echo "Removed the Lubuto window buttons from '$profile'."
  done
}

# GDM runs its own shell session with no user extensions and no ~/.themes, so
# the login screen only ever reads the system gnome-shell-theme.gresource.
# This builds a resource from the linked variant and puts it over the system
# file, keeping the original next to it. A gnome-shell update restores the
# stock file; run the step again after one.
GDM_RESOURCE=/usr/share/gnome-shell/gnome-shell-theme.gresource
GDM_BACKUP="$GDM_RESOURCE.lubuto-backup"

install_gdm() {
  local dest="$1"
  local name="$2"
  local theme="$3"
  local color="$4"
  local size="$5"
  local ctype="$6"

  local THEME_DIR="${1}/${2}${3}${4}${5}${6}"
  local built="$REPO_DIR/build/gdm/gnome-shell-theme.gresource"

  # The login background: the file given, else the current dark wallpaper.
  local background="${gdm_background:-}"
  if [[ -z "$background" ]]; then
    background="$(python3 -c 'import subprocess, urllib.parse
u = subprocess.run(["dconf", "read", "/org/gnome/desktop/background/picture-uri-dark"], capture_output=True, text=True).stdout.strip().strip("\x27")
print(urllib.parse.unquote(u.removeprefix("file://")) if u.startswith("file://") else "")' 2> /dev/null)"
  fi
  local extra=()
  if [[ -n "$background" && -f "$background" ]]; then
    extra=(--background "$background")
    echo -e "\nGDM: login background '$background'."
  fi

  echo -e "\nGDM: building a login screen resource from '$THEME_DIR'..."
  python3 "$REPO_DIR/tools/build-gdm-theme.py" "$THEME_DIR/gnome-shell" "$built" "${extra[@]}" || exit 1

  # The original is kept once; later runs replace a Lubuto resource.
  local commands="[ -f '$GDM_BACKUP' ] || cp -p '$GDM_RESOURCE' '$GDM_BACKUP'; install -m 644 '$built' '$GDM_RESOURCE'"
  if [[ "$UID" == "$ROOT_UID" ]]; then
    sh -c "$commands"
  elif [[ -t 0 ]] && command -v sudo > /dev/null; then
    sudo sh -c "$commands"
  else
    echo "Install it as root with:"
    echo "  sudo sh -c \"$commands\""
    return 0
  fi
  echo "Installed. The login screen uses it at the next logout. Undo with: $0 --remove --gdm"
}

uninstall_gdm() {
  if [[ ! -f "$GDM_BACKUP" ]]; then
    echo -e "\nNo backup at $GDM_BACKUP; the GDM step was not applied."
    return 0
  fi
  local commands="mv -f '$GDM_BACKUP' '$GDM_RESOURCE'"
  if [[ "$UID" == "$ROOT_UID" ]]; then
    sh -c "$commands"
  elif [[ -t 0 ]] && command -v sudo > /dev/null; then
    sudo sh -c "$commands"
  else
    echo "Restore it as root with:"
    echo "  sudo sh -c \"$commands\""
    return 0
  fi
  echo -e "\nRestored the stock login screen resource."
}

gdm_theme() {
  for theme in "${themes[@]}"; do
    for color in "${lcolors[@]}"; do
      for size in "${sizes[0]}"; do
        install_gdm "${dest:-$DEST_DIR}" "${_name:-$THEME_NAME}" "$theme" "$color" "$size" "$ctype"
      done
    done
  done
}

# Flatpak apps run in a sandbox with their own GTK and no view of ~/.themes,
# so they draw their bundled theme. A user override grants read access to the
# themes directory and names the variant through GTK_THEME, which both GTK 3
# and GTK 4 honour inside the sandbox.
flatpak_override() {
  local dest="$1"
  local name="$2"
  local theme="$3"
  local color="$4"
  local size="$5"
  local ctype="$6"

  local THEME_DIR="${1}/${2}${3}${4}${5}${6}"
  local variant="${2}${3}${4}${5}${6}"

  if ! has_command flatpak; then
    echo "'flatpak' not found, skipping the Flatpak override."
    return 0
  fi
  if [[ "$UID" == "$ROOT_UID" ]]; then
    echo "Do not run --flatpak with sudo. The override is per user."
    exit 1
  fi
  if [[ ! -d "$THEME_DIR" ]]; then
    echo "'$THEME_DIR' is not installed, skipping the Flatpak override."
    return 0
  fi

  # Flatpak stores a path under the home directory as ~/..., so pass it that
  # way or the same directory is listed twice.
  local themes_dir="${dest/#$HOME/\~}"
  echo -e "\nFlatpak: granting read access to '$themes_dir' and setting GTK_THEME=$variant for all apps..."
  flatpak override --user --filesystem="$themes_dir:ro" --env=GTK_THEME="$variant"
  echo "Undo with: $0 --remove --flatpak"
}

flatpak_unoverride() {
  if ! has_command flatpak; then
    return 0
  fi
  echo -e "\nFlatpak: removing the themes access and GTK_THEME override..."
  local themes_dir="${dest:-$DEST_DIR}"
  flatpak override --user --nofilesystem="${themes_dir/#$HOME/\~}" --unset-env=GTK_THEME
}

flatpak_theme() {
  for theme in "${themes[@]}"; do
    for color in "${lcolors[@]}"; do
      for size in "${sizes[0]}"; do
        flatpak_override "${dest:-$DEST_DIR}" "${_name:-$THEME_NAME}" "$theme" "$color" "$size" "$ctype"
      done
    done
  done
}

EXTENSION_UUID="lubuto@richardmwaba.github.io"
USER_THEME_UUID="user-theme@gnome-shell-extensions.gcampax.github.com"

# Packs, installs and enables the shell extension for the current user, and
# disables user-theme because the extension loads the shell stylesheet itself.
install_extension() {
  if [[ "$UID" == "$ROOT_UID" ]]; then
    echo "Do not run --extension with sudo. The extension installs per user."
    exit 1
  fi

  if ! has_command gnome-extensions; then
    echo "'gnome-extensions' not found. GNOME Shell 50 is required for the extension."
    exit 1
  fi

  local zip
  zip="$("$REPO_DIR/tools/build-extension.sh")"
  gnome-extensions install --force "$zip"

  local ext_dir="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
  glib-compile-schemas "$ext_dir/schemas"

  # A running shell only learns about a new extension directory at login, so a
  # first install is enabled through the setting and takes effect next login.
  # The extension disables user-theme itself when it starts.
  if gnome-extensions list | grep -qx "$EXTENSION_UUID"; then
    gnome-extensions enable "$EXTENSION_UUID"
    echo -e "\nInstalled and enabled $EXTENSION_UUID. Log out and back in once so the shell loads the new version."
  else
    local enabled
    enabled="$(gsettings get org.gnome.shell enabled-extensions 2> /dev/null | tail -n 1)"
    if [[ "$enabled" != *"$EXTENSION_UUID"* ]]; then
      if [[ "$enabled" == "@as []" || -z "$enabled" ]]; then
        gsettings set org.gnome.shell enabled-extensions "['$EXTENSION_UUID']"
      else
        gsettings set org.gnome.shell enabled-extensions "${enabled%]}, '$EXTENSION_UUID']"
      fi
    fi
    echo -e "\nInstalled $EXTENSION_UUID. Log out and back in to start it; it replaces user-theme on first start."
  fi
}

uninstall_extension() {
  if gnome-extensions list | grep -qx "$EXTENSION_UUID"; then
    gnome-extensions uninstall "$EXTENSION_UUID" && echo "Removed $EXTENSION_UUID."
  fi
}
