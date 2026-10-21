# Changelog

Dates are when the release was tagged.

## Unreleased

### Extension

- Dock: plugging in a monitor that takes over the same monitor index no longer leaves the dock, its
  blur and its autohide edge on the old monitor's frame. A laptop panel alone and an external display
  alone are both index 0, and the dock refreshed its frame only on an index change; it now refreshes
  whenever the monitor's geometry differs.
- Corners: an X11 window withdrawn during its minimise animation, as Zoom does, no longer aborts the shell.
  Mutter clears the window's workspace inside the unmanage and emits `workspace-changed` there, and the
  corners module answered by asking for the window's work area, which asserts without a workspace. The
  window is dropped on `unmanaging`, and a window without a workspace is never queried.
- Popover blur: the backdrop no longer settles 4% smaller than the menu. GNOME 50 opens a box pointer
  with a scale animation from 0.96, and the backdrop framed itself from the scaled geometry; it now
  frames from allocations and mirrors the scale and pivot.

## 0.1.0 (2026-10-12)

First Lubuto release, forked from Orchis.

### Theme

- GNOME 50 only. Every other target of Orchis is dropped: Cinnamon, XFWM4, Plank, Metacity, GTK 2,
  Firefox and the non-GNOME GTK 3 app styles.
- Shell stylesheet covers the GNOME 50 nodes: scrollbars, workspace switcher, recording and sharing pills,
  keyboard subkeys, message action bin, login authentication list, conflicting session dialog, parental
  controls shield, lock screen notifications, polkit and Looking Glass panes.
- libadwaita 1.9 coverage: the named colours and `:root` variables it expects, dialogs, bottom sheets,
  toggle groups, tab overview, shortcut keycaps.
- Glass tokens: tint, strong tint, rim, highlight, two short shadows, three radii (window 16 px, surface
  12 px, control 8 px). The `noglass` tweak keeps surfaces solid.
- Crisp pass: flat headerbars with a highlight edge and a hairline only where content scrolls under them,
  translucent sidebars with a rim, cards and popovers with a 1 px rim and short shadow, controls at 8 px
  and surfaces at 12 px, GTK 3 parity.
- Shell font family is SF Pro Text, Inter, Cantarell, so the shell and GTK share a family.
- Build on Dart Sass with `@use` and `@forward`, no deprecation warnings. CI parses every GTK stylesheet
  with the real GTK 3 and GTK 4 parsers on Fedora 44.

### Extension

- `lubuto@richardmwaba.github.io` loads the shell stylesheet for the chosen variant and retires
  `user-theme`.
- Blur: a live copy of the desktop, blurred behind the panel, popovers and dock; the overview blurs the
  wallpaper. Tint strength per surface.
- Rounded window corners with shadows, ported from Rounded Window Corners Reborn.
- Dock: a Dash subclass in a glass pill at the bottom, fixed icon size, hover magnify, autohide with a
  pressure barrier, sized from its content.
- Translucent window move and resize. Wobbly windows, ported from Compiz Windows Effect.
- Preferences window for every setting.

### Installer and presets

- `install.sh` flags for the GTK 4 link, the extension, fonts, Flatpak, Firefox, GDM, icons and cursor,
  each with an undo.
- Crisp font preset: fontconfig snippet and gsettings script with a saved undo.
- Firefox window buttons through `userChrome.css`.
- Icons and cursor fetched from pinned upstream releases listed in `presets/icons.manifest`: Hatter,
  Tela, Bibata.

### Tools

- `tools/check-gtk-css.py` parses compiled stylesheets with GTK.
- `tools/render-gtk.py` renders a sample window to PNG with the active theme, GTK 3 or GTK 4.
- `tools/fetch-icons.sh` installs a manifest entry.
- `tools/build-extension.sh` packs the extension.
- `tools/build-gdm-theme.py` builds a login screen resource from an installed variant.
- `tools/measure.sh` and `tools/measure-frames.py` are the performance protocol.

### Known issues

- Logging out hangs gnome-shell for five seconds before the login screen appears: Xwayland dies as the
  session's X11 apps are killed, and mutter 50.5 then blocks on an X11 round trip for the next window
  that goes away. The same abort happens with the extension disabled. The extension drops its effects
  as soon as the end-session dialog confirms, so the frozen frame carries no Lubuto visuals. GNOME's
  crash protection can flip `org.gnome.shell disable-user-extensions` to true after the abort;
  `gnome-extensions enable lubuto@richardmwaba.github.io` undoes it.
