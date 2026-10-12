# Lubuto plan

Status: Phase 5 done on 2026-10-11. Phase 6 (fluidity and performance) next.

Lubuto (Bemba: light) is a fork of [Orchis](https://github.com/vinceliuice/Orchis-theme) aimed at one target:
GNOME 50 on Wayland, styled after macOS 27 Liquid Glass. It ships as two parts that install together: GTK
theme files, and one GNOME Shell extension that loads the shell theme and provides every visual behaviour
the look depends on. It stays public under GPL-3.0.

## Goals

1. **One platform.** GNOME Shell 50, GTK 3, GTK 4 and libadwaita. Nothing else.
2. **One thing to install.** A theme directory and a single extension. No user-theme, no third-party
   visual extensions.
3. **Liquid Glass look.** Frosted, tinted surfaces with a light rim, unified radii, soft depth. Blur is done
   by the extension; the stylesheet supplies tint, rim and shadow.
4. **Fluid and fast.** Every effect is measured on the reference machine before it ships. Smooth beats fancy.
5. **Crisp.** Hairline borders, tight shadows, a font-rendering preset, consistent pixel alignment.
6. **Full colour matrix.** All Orchis accent colours, light and dark, standard and compact.

## Non-goals

- Cinnamon, XFWM4, Plank, Metacity, GTK 2, Firefox, and GNOME Shell releases before 50.
- Dynamic (per-frame) blur. Static blur only.
- Redistributing SF Pro. The font preset uses Inter and accepts a user-supplied SF Pro.
- Utility and hardware extensions. Caffeine, Clipboard Indicator, Vitals, ThinkPad battery threshold,
  EasyScreenCast, Unblank, AppIndicator, Citrix OSK and Tiling Assistant stay external. The theme styles their
  panel indicators and menus with CSS and nothing more.
- Coverflow Alt-Tab. The stock switcher gets glass styling instead. Revisit after the dock ships.
- Vendoring icon or cursor themes. The installer downloads pinned upstream releases from a manifest.

## Reference machine

| Item | Value |
| --- | --- |
| Shell | GNOME Shell 50.5, mutter 50.5, Wayland, Fedora 44 |
| Render GPU | GTX 1650 (driver 615) is mutter's primary since 2026-10-10 via `/etc/udev/rules.d/61-mutter-primary-gpu.rules`. It owns the HDMI 3440x1440 output. Intel UHD 630 owns eDP-1 and receives a copied frame when that panel is enabled. |
| Displays | 3440x1440, 2560x1440, 1920x1080, all at scale 1 |
| Current setup | Orchis-Teal-Dark-Compact, Inter 11, Hatter-Teal icons, Bibata-Modern-Ice cursor |
| Build tools | node, npm, Dart Sass, ESLint, glib-compile-schemas |

The 3440x1440 panel at scale 1 is the hard case for blur cost. Every performance check runs with all three
displays attached. The NVIDIA GPU never sleeps because that panel hangs on it, so running it as mutter's
primary GPU costs little power and moves blur and the cross-GPU copy onto the faster chip. Phase 6 measures
the Intel-only configuration too so the theme stays usable on machines without a discrete GPU.

## Architecture

### Two deliverables

| Deliverable | Installs to | Contains |
| --- | --- | --- |
| Theme directory `Lubuto-<Colour>[-Light/-Dark][-Compact]` | `~/.themes/` | `gtk-3.0/`, `gtk-4.0/`, `gnome-shell/` (CSS and assets), `index.theme` |
| Extension `lubuto@richardmwaba.github.io` | `~/.local/share/gnome-shell/extensions/` | theme loader, blur, rounded corners, dock, window effects, panel tweaks, prefs |

The extension reads the shell CSS from the selected theme directory, so colour and variant switching does
not require reinstalling the extension. GTK apps read their theme the usual way.

### Extension modules

One extension, one UUID, one gsettings schema (`org.gnome.shell.extensions.lubuto`), feature modules
under `extension/src/`. Each module has `enable()` and `disable()` and a settings key that turns it off.

| Module | Origin | Approach |
| --- | --- | --- |
| `theme` | user-theme (GNOME) | Rewrite. Sets `St.ThemeContext` theme from the selected theme directory, follows the GNOME colour scheme for light and dark. About 100 lines. |
| `blur` | Blur my Shell | Rewrite on `Shell.BlurEffect`. Static blur of the background actor behind panel, dock, overview and popovers. Pipelines fixed per surface, radius and brightness per light and dark. The blur surface takes its geometry from the styled content box, including margins, and its corner radius from that node's theme, so it never outgrows the rounded content. About 800 lines. |
| `corners` | Rounded Window Corners Reborn | Copy the built JS with attribution. Shader clip at 16 px, off when maximised or fullscreen. |
| `dock` | Dash to Dock | Decide in Phase 5 after blur ships. Option A: minimal macOS dock, about 2k lines, dots for running apps, magnify on hover, no previews. Option B: embed Dash to Dock core with prefs and preview code stripped, about 6k lines. |
| `move` | Transparent Window Moving | Copy with attribution. About 200 lines. |
| `wobble` | Compiz Windows Effect | Copy with attribution, restrained defaults. About 1.5k lines plus shader. |
| `panel` | Just Perfection | Skipped. The theme assumes no Just Perfection toggle, so the extension stays external. |
| `prefs` | new | One libadwaita preferences window: theme colour, variant, per-module toggles, blur strength. |

Copied modules keep upstream licence headers. `THIRD_PARTY.md` lists origin, version and licence per module.
All upstream code is GPL-2 or later or GPL-3, compatible with the project licence.

Ownership rule: a copied module is forked, not tracked. Upstream fixes are ported by hand when a GNOME
release breaks the module. A rewritten module has no upstream.

### Porting rules

Code copied from another extension is brought up to the current GNOME 50 extension conventions before it is
committed. The goal is zero deprecated API in the tree, so the next shell release breaks as little as possible.

- ES modules only. `import` from `resource:///org/gnome/shell/...` and `gi://`. No `imports.*`, no `Lang`,
  no `Mainloop`, no `ByteArray`, no `Tweener`.
- `Extension` and `ExtensionPreferences` base classes from `resource:///org/gnome/shell/extensions/`.
  Settings through `this.getSettings()`. Prefs in GTK 4 and libadwaita only.
- Monkeypatching through `InjectionManager`, undone in `disable()`. No bare prototype assignment.
- Every signal, timeout, idle and effect is tracked and removed in `disable()`. Use `GLib.timeout_add` with
  stored source ids or `GLib.Source.remove`, and `connectObject` where the target supports it.
- Current Clutter, St, Meta and Shell API. `add_child` not `add_actor`, `ease()` not Tweener,
  `Shell.BlurEffect` `radius` not `sigma`, `Clutter.Actor` properties not deprecated getters.
- `GObject.registerClass` with explicit `GTypeName`, `Properties` and `Signals`.
- Shaders as `Shell.GLSLEffect` or `Clutter.ShaderEffect` with Cogl snippets. No fixed-function paths.
- ESLint with the gnome-shell shared config runs in CI. Lint errors fail the build.
- Dead branches for older shell versions are deleted on port, not kept behind version checks.
- Upstream licence header stays at the top of the file, followed by a line stating the Lubuto version and
  what changed.

Theme side has the same rule. `sassc` (libsass) is deprecated upstream. The build moves to Dart Sass in
Phase 0 and the SASS tree migrates from `@import` and `/` division to `@use`, `@forward` and `math.div` so
the stylesheet compiles without deprecation warnings.

### Repo layout after Phase 0

```
src/
  _sass/              shared SASS: palette, tokens, drawing, gtk/, gnome-shell/
  gnome-shell/        shell-50/ entry points, assets, theme-<Colour>/
  gtk/                3.0/ and 4.0/ entry points, assets
extension/
  metadata.json
  extension.js        loads modules in order, handles enable/disable
  prefs.js
  schemas/
  src/<module>/
  THIRD_PARTY.md
presets/
  fontconfig/         fontconfig snippet for the crisp preset
  gsettings.sh        font and rendering keys
  icons.manifest      icon and cursor themes: name, upstream URL, pinned tag, licence, colour map
tools/
  build-extension.sh  compiles schemas, zips the extension
  check-gtk-css.py    parses compiled stylesheets with the real GTK 3 and GTK 4 parsers
  render-gtk.py       renders a sample window of common widgets to PNG, GTK 3 or GTK 4
docs/
  PLAN.md             this file
  MEASURING.md        frame-time protocol
```

### Glass is layered

| Layer | Owner |
| --- | --- |
| Blur and brightness | `blur` module |
| Tint, rim light, inner highlight, shadow | shell and GTK stylesheets |
| Window corner radius | `corners` module at 16 px and matching `$default_corner` |
| Window buttons | Orchis `macos` tweak, on by default |

### Design tokens

New SASS tokens in `_variables.scss`, derived per colour and variant so the whole matrix stays consistent:

- `$glass-tint` and `$glass-tint-strong`: surface colour with alpha, light and dark.
- `$glass-rim`: 1 px outer border, high contrast against the tint.
- `$glass-highlight`: inner top highlight that reads as a specular edge.
- `$glass-shadow` and `$glass-shadow-raised`: short, low-blur shadows.
- `$radius-window`, `$radius-surface`, `$radius-control`: 16, 12, 8 px, matching the `corners` module.
- `$duration-*` and `$ease-*`: shortened to match macOS feel, see Phase 6.

## Phases

### Phase 0: bootstrap

- [x] Rename the theme to `Lubuto` in `install.sh`, `core.sh`, `README.md`, `index.theme` templates.
- [x] Remove Cinnamon, XFWM4, Plank, Metacity, GTK 2, Firefox and shell 3.28 to 47 sources and installer paths.
- [x] Collapse `shell-48-0` into `shell-50`, keep `_widgets-48-0.scss` content as the starting point.
- [x] Trim `parse-sass.sh` and `core.sh` to the remaining targets. Keep colour, variant and size loops.
- [x] Port the two uncommitted fixes. The libadwaita CSS variable interpolation and the server-side
      decoration headerbar rule are in. The sidebar selector change and the `theme($theme)` selection colour
      were already upstream.
- [x] Replace `sassc` with Dart Sass (`sass-embedded`, the native compiler, pinned; the JS `sass` package
      compiles five times slower). Fix `/` division with `math.div`. `@import` stays for now; the `@use`
      migration is Phase 3. Recursive `@extend rubberband` chains now extend a placeholder, since Dart Sass
      expanded them into a tenfold larger GTK 3 stylesheet.
- [x] GitHub Actions: build the full CSS matrix with Dart Sass on push, fail on errors and on deprecation
      warnings.

Exit: `./install.sh` builds and installs every colour, variant and size on the reference machine, and the
desktop looks the same as today with user-theme still loading the shell CSS.

Result: 54 variants build in under a minute. The Teal dark compact output matches the sassc build of the
same source except for rule order and fractional colour notation. Lubuto-Teal-Dark-Compact is installed and
selected with the same flags as the previous Orchis install (`--tweaks compact black submenu`, libadwaita link).

### Phase 1: GNOME 50 baseline

- [x] Extract the GNOME 50 default stylesheet from `/usr/share/gnome-shell/gnome-shell-theme.gresource` and
      diff its selector list against the fork's shell SASS. Record missing and dead selectors.
- [x] Fix every missing selector: scrollbar handles, workspace switcher OSD, screen recording and sharing
      pills, keyboard subkeys popover, notification action bin, message list clear button, calendar events,
      panel indicator boxes, break countdown, search status box, restart message, access dialog.
- [ ] Deferred shell nodes, 29 of them: login dialog auth list, unlock dialog notifications, parental
      controls shield, conflicting session dialog, polkit user label, Looking Glass panes. Style them before
      Phase 9.
- [x] Calendar popover: bottom corners rendered square while the top corners were round. Cause: Blur my
      Shell's popup blur sizes its surface from the popover actor, not from `.popup-menu-content`, which has
      a 14 px bottom margin in Orchis. Popup blur is off on the reference machine until the `blur` module
      replaces it.
- [x] Check the libadwaita stylesheet Fedora 44 ships (libadwaita 1.9.4, GTK 4.22) against the GTK 4 theme.
      Fourteen named colours and five :root variables were never defined and fell back to Adwaita greys;
      AdwDialog, bottom sheet, toggle group, tab overview and shortcut label had no theme rules. All added.
- [x] Verify the accent-colour follow path (`accent_type`) on GNOME 50. GTK 4 follows the system accent
      through `@accent_bg_color`; the shell uses the theme colour. The legacy `theme_selected_bg_color`
      define used a CSS variable, which GTK rejects, so every GTK 4 app logged a parse error. Fixed.
- [x] `tools/check-gtk-css.py` runs the real GTK 3 and GTK 4 parsers over compiled stylesheets. CI runs it.

Exit: no unstyled or default-styled surface in a walk-through checklist covering shell and the core GNOME apps.

### Phase 2: extension skeleton and theme loader

- [x] `extension/` with `metadata.json` (shell-version 50), schema, `extension.js` module loader, empty prefs.
- [x] ESLint config from gnome-shell, `npm run lint`, wired into CI.
- [x] `theme` module: read theme name and variant from the schema, set the shell theme, follow
      `org.gnome.desktop.interface color-scheme` for light and dark.
- [x] `tools/build-extension.sh` and an `install.sh --extension` step that installs and enables it, and
      disables user-theme if enabled.
- [x] Prefs window with theme colour and variant pickers.

- [ ] The libadwaita link in `~/.config/gtk-4.0` is static, so GTK 4 apps keep one variant while the shell
      follows the colour scheme. Have the theme module manage that link (or the `gtk-theme` setting is
      enough once libadwaita reads themes from it). Decide in Phase 7.

Exit: user-theme disabled, the extension loads the shell CSS, switching variant in prefs applies live.

Result: on the reference machine Lubuto retired user-theme on first start, loaded Lubuto-Teal-Dark-Compact
and synced the GTK theme setting. The prefs window opens. A new extension directory is only discovered at
login, so a first install enables through the setting and takes effect next login.

### Phase 3: design tokens and glass flag

- [x] Add the tokens listed under Design tokens. Derive light and dark values from each colour palette.
- [x] Add the `glass` tweak flag and wire it through `install.sh`, `core.sh` and `_tweaks.scss`. Default on.
- [x] Make the `macos` window-button tweak the default. `--tweaks buttons` restores the Orchis style.
- [x] Set `$default_corner` to 16 px and derive the smaller radii from it.
- [x] Migrate off legacy `if()`, the global colour functions and unqualified built-ins, output-identical.
      Lightness steps go through `lighter()` and `darker()`, which clamp and convert back to rgb, because
      GTK 3 cannot parse the `hsl()` Dart Sass would otherwise emit.
- [ ] `@use` and `@forward`: deferred. The module migrator refuses the tree because entry files configure
      the shared partials with plain variables before importing them. Converting to `@use ... with ()` is
      a manual refactor. `@import` keeps working while sass-embedded 1.x is pinned. Revisit before Phase 9
      or when Dart Sass 3.0 ships.

Exit: tokens compile across the matrix, no visual change yet except radii and window buttons.

Result: done 2026-10-11. The only remaining Sass deprecation is `@import`.

### Phase 4: blur and corners

- [x] `blur` module: static blur behind the panel, the overview and every panel popover. Backdrops are
      frame-sized actors with a rounded-clip GLSL snippet, radius read from the content's theme node.
- [x] `corners` module: ported from Rounded Window Corners Reborn, shaders inlined, per-app overrides
      dropped. Default 16 px, off when maximised or fullscreen, soft shadow under rounded windows.
- [x] Shell stylesheet: panel and popover contents use the glass tint tokens and a rim.
- [x] Popovers over windows: backdrops now blur a live clone of the window group, so windows behind a
      surface blur too. Costs a second paint of the covered windows while the surface shows; Phase 6
      measures it. The strong tint can come back down once the look is judged.
- [ ] Notification banners, OSD, the Alt-Tab switcher and app folders have no backdrop yet. Add them as
      blur targets with the Phase 6 budget in hand, then give them the glass tint.
- [ ] Light and dark screenshots per surface in `images/`. Dark done on the reference machine, light pending.

Exit: panel, popovers, overview and windows look like glass with Blur my Shell and Rounded Window Corners
disabled.

Result: done 2026-10-11 for panel, popovers, overview and windows. Rounded Window Corners Reborn is
disabled. Blur my Shell stays enabled only for its Dash to Dock blur until the `dock` module ships; its
panel, overview, popup and application blur are off. Two mistakes worth remembering: an offscreen effect
renders the whole actor, not its clip, so a backdrop must be the size of its frame; and Blur my Shell's
application blur paints a square behind rounded windows.

### Phase 5: dock and window effects

- [x] Dock option A chosen on 2026-10-11, built on the shell's own Dash: favourites, running apps, drag
      reorder, app menus and tooltips come from it. Lubuto adds fixed icon size, hover magnify, placement,
      glass backdrop, autohide with an edge pressure barrier, and keeps the dock above the overview.
- [x] `dock` module and its stylesheet: glass pill, dots for running apps, hover lift, bottom placement,
      per-monitor choice, autohide.
- [x] `move` module: written fresh, opacity and duration in the schema.
- [x] `wobble` module: ported per Porting rules, attributed, upstream defaults. Phase 6 decides whether it stays on by default.
- [x] `panel` module: skipped on 2026-10-11. The theme assumes no Just Perfection toggle; Just Perfection stays external.
- [x] Prefs: per-module toggles and the few numeric settings that matter.

Exit: Dash to Dock, Transparent Window Moving, Compiz Windows Effect and Just Perfection disabled, no
visible regression.

Result: done 2026-10-11. Dash to Dock, Transparent Window Moving, Compiz Windows Effect, Rounded Window
Corners Reborn and Blur my Shell are all disabled on the reference machine. Just Perfection stays, by
choice. `extension/THIRD_PARTY.md` lists the ported code.

### Known issues outside Lubuto

- Logout shows a brief screen distortion. The journal has gnome-shell crashing in mutter's X11 display
  teardown (`meta_x11_display_dispose` → `meta_window_focus` → `XIfEvent`), with no Lubuto frames on the
  stack. A mutter 50.5 bug on this machine; retest after the next mutter update.

### Phase 6: fluidity and performance

Target: no dropped frames at 60 Hz on the 3440x1440 display during panel menu open, overview enter and exit,
Alt-Tab, window move, and workspace switch, with the other two displays attached.

- [ ] Primary GPU: measure the interaction set with NVIDIA primary (today) and with the udev rule removed so
      Intel is primary. Record both in `MEASURING.md` with how to switch.
- [ ] Write `docs/MEASURING.md`: `nvidia-smi dmon` and `intel_gpu_top` for GPU busy, `sysprof-cli` capture of
      gnome-shell during a scripted interaction set, and a stutter checklist. Baseline today's setup first.
- [ ] Animations: shorten the `$duration` set, ease-out on enter, ease-in on exit. Compare against GNOME
      defaults and macOS timing by eye and by frame count.
- [ ] Blur: measure each surface alone. Keep a surface off by default if it costs more than a few percent GPU
      at idle on Intel.
- [ ] Wobble: measure the shipped preset. Ship on, or ship off with a documented opt-in.
- [ ] Corners: measure shader cost with many windows open.

Exit: every shipped effect has a before and after line in `MEASURING.md`.

### Phase 7: GTK and libadwaita crisp pass

- [x] Hairline borders: `$glass-rim` on sidebars, popovers, cards, OSD toolbars and sheets; `$divider`
      between list rows.
- [x] Shadows: popovers, menus, OSD toolbars and sheets use `$glass-shadow-raised`, backdrop
      `$glass-shadow`. Window decorations keep their large shadow because the corners module clips
      it anyway and GTK sizes the resize border from it.
- [x] Headerbar: flat tint, `$glass-highlight` top edge, no bottom line. The `undershoot` mixin draws a
      `$glass-rim` hairline and a short shade where content scrolls under a bar.
- [x] Sidebars: `$glass-sidebar` is a translucent tint over the window background, rim between sidebar
      and content. A dark top bar on a light variant keeps the solid dark sidebar.
- [x] Controls: `$corner-radius` is `$radius-control` (8 px); cards, frames, notebooks, menus and
      OSD surfaces step up to `$radius-surface` (12 px).
- [x] GTK 3 parity: same tokens in `_common-3.20.scss` and `_gnome-3.22.scss`.
- [x] Pixel audit with `tools/render-gtk.py` at scale 1 and 2: 1 px rims and radii stay crisp. Still to
      check on the real displays: side-by-side apps on the reference machine.

Exit: Nautilus, Settings, Text Editor, Console, Software, a GTK 3 app and an Electron app side by side look
like one family.

### Phase 8: crisp rendering preset

- [ ] `presets/fontconfig/50-lubuto.conf`: Inter as the sans default, slight hinting, grayscale
      antialiasing, subpixel positioning on. Alias SF Pro to Inter when SF Pro is absent.
- [ ] `presets/gsettings.sh`: interface, document and monospace fonts, `font-hinting slight`,
      `font-antialiasing grayscale`, shell font sizes that match the stylesheet.
- [ ] Try `rgba` antialiasing on the reference displays and record which one reads sharper. Ship that.
- [ ] `install.sh --fonts` applies the preset and prints how to undo it.
- [ ] `install.sh --flatpak`: grant Flatpak apps read access to `~/.themes` and set `GTK_THEME` for the
      selected variant through `flatpak override --user`, with a printed undo. Sandboxed apps (GIMP, the
      snap App Center) otherwise draw their own title bars with their bundled theme.

Exit: text in shell, GTK 4 and GTK 3 renders at the same weight and sharpness side by side.

### Phase 8b: icons and cursor

Nothing is vendored. `presets/icons.manifest` lists each theme with upstream URL, pinned release tag, licence
and, for icon themes, the map from Lubuto colour to icon variant. The installer clones the tag into `~/.icons`.

| Role | Default | Alternative |
| --- | --- | --- |
| Icons | Hatter, variant picked from the theme colour (Teal, Blue, Green, Orange, Pink, Purple, Red, Yellow direct; Grey maps to Slate) | Tela, same colour mapping |
| Cursor | Bibata-Modern-Ice | Bibata-Modern-Classic |

- [ ] Confirm the Hatter licence upstream. If it does not permit redistribution, the installer still fetches
      from upstream, and the README says the icons are not part of Lubuto.
- [ ] `presets/icons.manifest` and `tools/fetch-icons.sh` that clones a pinned tag, verifies the directory
      has `index.theme`, and never overwrites an existing directory without `--force`.
- [ ] `install.sh --icons [hatter|tela]` and `--cursor [ice|classic]`. Both off unless given or `--full`.
      Applying the gsettings keys is a separate confirmation so an existing icon choice is never replaced
      silently.
- [ ] Screenshots for each default per colour.

Exit: a fresh install with `--full` reproduces the reference machine's icons and cursor for any colour.

### Phase 9: docs and release

- [ ] README: scope, requirements, one-command install, flags, screenshots per colour.
- [ ] `THIRD_PARTY.md`, CHANGELOG, contribution notes.
- [ ] Tagged release with a prebuilt theme zip and extension zip from CI.

## Decisions

| Date | Decision |
| --- | --- |
| 2026-10-10 | GNOME 50 only. Drop every other target. |
| 2026-10-10 | Full colour matrix, light and dark, standard and compact. |
| 2026-10-10 | NVIDIA GTX 1650 is mutter's primary GPU on the reference machine via udev tag. Rule stays. |
| 2026-10-10 | One extension owns every visual behaviour. Visual third-party extensions are not vendored, their relevant parts are copied or rewritten as modules. Utility and hardware extensions stay external. |
| 2026-10-10 | Coverflow Alt-Tab dropped. Tiling Assistant stays external. |
| 2026-10-10 | Icons and cursor: Hatter per colour and Bibata-Modern-Ice as defaults, Tela and Bibata-Modern-Classic as alternatives, fetched from upstream by manifest, never vendored. |
| 2026-10-10 | Ported code is modernised to GNOME 50 conventions before commit, see Porting rules. Build moves from libsass to Dart Sass. |
| 2026-10-11 | Dock: option A, a Dash subclass in a glass pill. Blur my Shell is no longer needed on the reference machine. |
| 2026-10-10 | Name: Lubuto (Bemba, light). Theme dirs `Lubuto-<Colour>[-Light/-Dark][-Compact]`, extension UUID `lubuto@richardmwaba.github.io`, schema `org.gnome.shell.extensions.lubuto`. |

## Open questions

