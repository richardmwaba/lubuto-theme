#! /usr/bin/env bash

REPO_DIR="$(dirname "$(readlink -m "${0}")")"
source "${REPO_DIR}/core.sh"

usage() {
cat << EOF
Usage: $0 [OPTION]...

OPTIONS:
  -d, --dest DIR          Specify destination directory (Default: $DEST_DIR)
  -n, --name NAME         Specify theme name (Default: $THEME_NAME)

  -t, --theme VARIANT     Specify theme color variant(s) [default|purple|pink|red|orange|yellow|green|teal|grey|all] (Default: blue)
  -c, --color VARIANT     Specify color variant(s) [standard|light|dark] (Default: All variants)s)
  -s, --size VARIANT      Specify size variant [standard|compact] (Default: All variants)

  -i, --icon VARIANT      Specify icon variant(s) for shell panel activities button
                          [default|apple|simple|gnome|ubuntu|arch|manjaro|fedora|debian|void|opensuse|popos|mxlinux|zorin|endeavouros|tux|nixos|gentoo|budgie|solus|kali]
                          (Default: ChromeOS style)

  -l, --libadwaita        Link the installed gtk-4.0 theme into ~/.config/gtk-4.0 so libadwaita apps use it
  -e, --extension         Install and enable the Lubuto shell extension (loads the shell theme, replaces user-theme)
  --fonts                 Apply the crisp preset: Inter and JetBrains Mono, slight hinting, grayscale antialiasing
                          (fontconfig snippet plus gsettings keys; '--remove --fonts' restores the previous values)
  --flatpak               Let Flatpak apps read the installed theme and set GTK_THEME to the linked variant
                          (same variant as -l; '--remove --flatpak' undoes the override)
  --firefox               Paint the Lubuto window buttons in Firefox's own title bar through a userChrome.css
                          in the default profile ('--remove --firefox' undoes it)
  --gdm                   Style the login screen with the same variant -l links: builds a gnome-shell-theme.gresource
                          and installs it over the system one with sudo, keeping a backup ('--remove --gdm' restores;
                          a gnome-shell update restores the stock file, run the step again after one)
  --gdm-background FILE   Image for the login screen behind the GDM step (Default: the current dark wallpaper)
  --icons [hatter|tela]   Fetch the icon theme pinned in presets/icons.manifest, in the variant that matches
                          the theme colour, into ~/.icons (Default: hatter); then offers to set icon-theme
  --cursor [ice|classic]  Fetch Bibata-Modern-Ice or Bibata-Modern-Classic into ~/.icons (Default: ice);
                          then offers to set cursor-theme
  --full                  -l -e --fonts --icons hatter --cursor ice
  -f, --fixed             Fixed accent (blue) colour instead of following the GNOME accent colour

  --tweaks                Specify versions for tweaks [solid|compact|black|primary|macos|submenu|(nord/dracula)] (Options can mix)
                          1. solid              No transparency panel variant
                          2. compact            No floating panel variant
                          3. black              Full black variant
                          4. primary            Change radio icon checked color to primary theme color (Default is Green)
                          5. buttons            Orchis window buttons instead of the default macOS style
                          6. submenu            Set normal submenus color contrast (dark submenu style on dark version)
                          7. [nord|dracula]     Nord/dracula colorscheme themes (nord and dracula can not mix use!)
                          8. noglass            Solid surfaces instead of translucent glass

  --round                 Change theme round corner border-radius [Input the px value you want] (Default: 16px, suggested 4px to 20px)
                          1. 3px
                          2. 4px
                          3. 5px
                          ...
                          13. 15px


  -r, --remove,
  -u, --uninstall         Uninstall/Remove installed themes

  -h, --help              Show help
EOF
}

themes=()
colors=()
sizes=()
othemes=()
ocolors=()
osizes=()
lcolors=()

while [[ "$#" -gt 0 ]]; do
  case "${1:-}" in
    -d|--dest)
      dest="$2"
      mkdir -p "$dest"
      shift 2
      ;;
    -n|--name)
      _name="$2"
      shift 2
      ;;
    -r|--remove|-u|--uninstall)
      remove="true"
      shift
      ;;
    -l|--libadwaita)
      libadwaita="true"
      shift
      ;;
    -e|--extension)
      extension="true"
      shift
      ;;
    --fonts)
      fonts="true"
      shift
      ;;
    --flatpak)
      flatpak="true"
      shift
      ;;
    --firefox)
      firefox="true"
      shift
      ;;
    --gdm)
      gdm="true"
      shift
      ;;
    --gdm-background)
      gdm_background="$2"
      shift 2
      ;;
    --icons)
      icons="hatter"
      shift
      case "${1:-}" in
        hatter|tela)
          icons="$1"
          shift
          ;;
      esac
      ;;
    --cursor)
      cursor="ice"
      shift
      case "${1:-}" in
        ice|classic)
          cursor="$1"
          shift
          ;;
      esac
      ;;
    --full)
      libadwaita="true"
      extension="true"
      fonts="true"
      icons="hatter"
      cursor="ice"
      shift
      ;;
    -f|--fixed)
      fixed="true"
      shift
      ;;
    --round)
      round="true"
      corner="$2"
      echo -e "Change round corner ${corner} value ..."
      shift 2
      ;;
    --tweaks)
      shift
      for variant in $@; do
        case "$variant" in
          solid)
            opacity="solid"
            echo -e "Install solid version ..."
            shift
            ;;
          compact)
            panel="compact"
            echo -e "Install compact panel version ..."
            shift
            ;;
          black)
            blackness="true"
            echo -e "Install black version ..."
            shift
            ;;
          primary)
            primary="true"
            echo "Change radio and check assets color ..."
            shift
            ;;
          buttons)
            orchisbuttons="true"
            echo -e "Install Orchis window button version ..."
            shift
            ;;
          macos)
            echo -e "macOS window buttons are the default; the flag is accepted and ignored."
            shift
            ;;
          noglass)
            noglass="true"
            echo -e "Install solid surfaces version ..."
            shift
            ;;
          submenu)
            submenu="true"
            echo -e "Install with themed sub-menus ..."
            shift
            ;;
          nord)
            nord="true"
            ctype="-Nord"
            echo -e "Install nord colorscheme ..."
            shift
            ;;
          dracula)
            dracula="true"
            ctype="-Dracula"
            echo -e "Install dracula colorscheme ..."
            shift
            ;;
          -*)
            break
            ;;
          *)
            echo "ERROR: Unrecognized tweaks variant '$1'."
            echo "Try '$0 --help' for more information."
            exit 1
            ;;
        esac
      done
      ;;
    -t|--theme)
      accent='true'
      shift
      for variant in "$@"; do
        case "$variant" in
          default)
            themes+=("${THEME_VARIANTS[0]}")
            shift
            ;;
          purple)
            themes+=("${THEME_VARIANTS[1]}")
            shift
            ;;
          pink)
            themes+=("${THEME_VARIANTS[2]}")
            shift
            ;;
          red)
            themes+=("${THEME_VARIANTS[3]}")
            shift
            ;;
          orange)
            themes+=("${THEME_VARIANTS[4]}")
            shift
            ;;
          yellow)
            themes+=("${THEME_VARIANTS[5]}")
            shift
            ;;
          green)
            themes+=("${THEME_VARIANTS[6]}")
            shift
            ;;
          teal)
            themes+=("${THEME_VARIANTS[7]}")
            shift
            ;;
          grey)
            themes+=("${THEME_VARIANTS[8]}")
            shift
            ;;
          all)
            themes+=("${THEME_VARIANTS[@]}")
            shift
            ;;
          -*)
            break
            ;;
          *)
            echo "ERROR: Unrecognized theme variant '$1'."
            echo "Try '$0 --help' for more information."
            exit 1
            ;;
        esac
      done
      ;;
    -c|--color)
      shift
      for variant in "$@"; do
        case "$variant" in
          standard)
            colors+=("${COLOR_VARIANTS[0]}")
            lcolors+=("${COLOR_VARIANTS[0]}")
            shift
            ;;
          light)
            colors+=("${COLOR_VARIANTS[1]}")
            lcolors+=("${COLOR_VARIANTS[1]}")
            shift
            ;;
          dark)
            colors+=("${COLOR_VARIANTS[2]}")
            lcolors+=("${COLOR_VARIANTS[2]}")
            shift
            ;;
          -*)
            break
            ;;
          *)
            echo "ERROR: Unrecognized color variant '$1'."
            echo "Try '$0 --help' for more information."
            exit 1
            ;;
        esac
      done
      ;;
    -s|--size)
      shift
      for variant in "$@"; do
        case "$variant" in
          standard)
            sizes+=("${SIZE_VARIANTS[0]}")
            shift
            ;;
          compact)
            sizes+=("${SIZE_VARIANTS[1]}")
            shift
            ;;
          -*)
            break
            ;;
          *)
            echo "ERROR: Unrecognized size variant '$1'."
            echo "Try '$0 --help' for more information."
            exit 1
            ;;
        esac
      done
      ;;
    -i|--icon)
      activities='icon'
      shift
      for icons in "$@"; do
        case "$icons" in
          default)
            icon='-default'
            shift
            ;;
          apple)
            icon='-apple'
            shift
            ;;
          simple)
            icon='-simple'
            shift
            ;;
          gnome)
            icon='-gnome'
            shift
            ;;
          ubuntu)
            icon='-ubuntu'
            shift
            ;;
          arch)
            icon='-arch'
            shift
            ;;
          manjaro)
            icon='-manjaro'
            shift
            ;;
          fedora)
            icon='-fedora'
            shift
            ;;
          debian)
            icon='-debian'
            shift
            ;;
          void)
            icon='-void'
            shift
            ;;
          opensuse)
            icon='-opensuse'
            shift
            ;;
          popos)
            icon='-popos'
            shift
            ;;
          mxlinux)
            icon='-mxlinux'
            shift
            ;;
          zorin)
            icon='-zorin'
            shift
            ;;
          endeavouros)
            icon='-endeavouros'
            shift
            ;;
          tux)
            icon='-tux'
            shift
            ;;
          nixos)
            icon='-nixos'
            shift
            ;;
          gentoo)
            icon='-gentoo'
            shift
            ;;
          budgie)
            icon='-budgie'
            shift
            ;;
          solus)
            icon='-solus'
            shift
            ;;
          kali)
            icon='-kali'
            shift
            ;;
          -*)
            break
            ;;
          *)
            echo "ERROR: Unrecognized icon variant '$1'."
            echo "Try '$0 --help' for more information."
            exit 1
            ;;
        esac
        echo "Install $icons icon for gnome-shell panel..."
      done
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: Unrecognized installation option '$1'."
      echo "Try '$0 --help' for more information."
      exit 1
      ;;
  esac
done

if [[ "${#themes[@]}" -eq 0 ]] ; then
  themes=("${THEME_VARIANTS[0]}")
fi

if [[ "${#colors[@]}" -eq 0 ]] ; then
  colors=("${COLOR_VARIANTS[@]}")
fi

if [[ "${#sizes[@]}" -eq 0 ]] ; then
  sizes=("${SIZE_VARIANTS[@]}")
fi

if [[ "${#lcolors[@]}" -eq 0 ]] ; then
  lcolors=("${COLOR_VARIANTS[1]}")
fi

if [[ ${remove} == 'true' ]]; then
  if [[ "$libadwaita" == 'true' ]]; then
    uninstall_link
  elif [[ "$extension" == 'true' ]]; then
    uninstall_extension
  elif [[ "$fonts" == 'true' ]]; then
    uninstall_fonts
  elif [[ "$flatpak" == 'true' ]]; then
    flatpak_unoverride
  elif [[ "$firefox" == 'true' ]]; then
    uninstall_firefox
  elif [[ "$gdm" == 'true' ]]; then
    uninstall_gdm
  else
    uninstall_theme
  fi
else
  if [[ "$libadwaita" == 'true' && "$UID" == "$ROOT_UID" ]]; then
    echo -e "Do not run -l with sudo, that will link libadwaita theme to root folder !"
    exit 0
  fi

  clean_theme
  install_theme

  if [[ "$libadwaita" == 'true' && "$UID" != "$ROOT_UID" ]]; then
    link_theme
  fi

  if [[ "$extension" == 'true' ]]; then
    install_extension
  fi

  if [[ "$flatpak" == 'true' ]]; then
    flatpak_theme
  fi

  if [[ "$fonts" == 'true' ]]; then
    install_fonts
  fi

  if [[ "$firefox" == 'true' ]]; then
    install_firefox
  fi

  if [[ -n "${icons:-}" ]]; then
    install_icons
  fi

  if [[ -n "${cursor:-}" ]]; then
    install_cursor
  fi

  if [[ "$gdm" == 'true' ]]; then
    gdm_theme
  fi
fi

echo
echo "Done."
