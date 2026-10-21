# Changelog

Dates are when the release was tagged.

## Unreleased

### Extension

- Theme: the colour tweaks are settings. `theme-palette` (default, Nord, Dracula), `theme-shade`
  (grey, graphite, black) and `theme-tweaks` (primary, solid, submenu) each add a suffix to the theme
  directory name, the shell stylesheet reloads at once, `gtk-theme` and the libadwaita links in
  `~/.config/gtk-4.0` follow under `sync-gtk-theme`, and GTK apps pick the change up on restart. A
  combination that is not installed logs a warning and falls back to the plain variant. The prefs
  Theme page has a Tweaks group whose rows say when a choice is not installed.
- Dock: a click on an icon whose app has two or more windows on the workspace opens previews of
  those windows above the icon; a click on a preview goes to that window, the wheel over the icon
  steps through them, arrows walk the previews from the keyboard. `dock-click-action` picks previews
  or a raise-the-next-window click instead, `dock-preview-size` sets the thumbnail width.
- Blur and dock: no more `Can't update stage views actor lubuto-...` warnings in the journal. The
  dock recentred and the backdrops framed themselves from allocation handlers, which queued a relayout
  after the layout pass; both now apply geometry from a before-redraw later, one frame later.
- Dock: a minimise shrinks the window into its icon in the dock, and a restore grows out of it.
  Windows of apps without an icon use the show-apps button. The shell animates to a window's icon
  geometry, and nothing in the stock shell sets one, so the fallback was the monitor corner.
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

### Theme

- Theme directories carry the colour tweaks in their name:
  `Lubuto-<Colour>[-Light|-Dark][-Compact][-Nord|-Dracula][-Graphite|-Black][-Primary][-Solid][-Submenu]`.
  `install.sh --matrix` builds every combination for the selected variants, with the asset
  directories shared between siblings, and `--remove` clears them. The installer writes the
  `--tweaks` set to the extension's keys so the shell loads the directory it built.
- `--tweaks graphite`: a dark surface shade a quarter of the way from the default grey to `black`.
  Window background `#191919`, sidebar `#1C1C1C`, cards `#252525`, popovers and the quick settings
  submenu box `#323232`. The default grey reads as washed out under the glass highlights and `black`
  is a hard step down; graphite keeps the depth and still reads as grey. The selected sidebar row
  in GTK apps paints a 9-slice PNG in the palette's base colour, so `tools/make-row-selected.py`
  mixes a graphite set from the grey and black ones. `graphite` and `black` do not mix.

- Shell: rules for the dock's window previews, `.lubuto-window-previews`.

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
