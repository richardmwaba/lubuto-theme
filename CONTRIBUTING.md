# Contributing

Lubuto targets GNOME Shell 50 on Wayland, with the GTK and libadwaita versions Fedora 44 ships. A change
that only works elsewhere is out of scope.

## Set up

```sh
npm ci
./install.sh -t teal -c dark -s compact -l -e
```

The install flags you use become your test setup. Log out and in after changing extension code: GNOME
Shell on Wayland loads extensions at login.

## Check a change

| What changed | Run |
| --- | --- |
| Sass | `./parse-sass.sh`, then `tools/check-gtk-css.py 4 src/gtk/4.0/gtk-Dark-Compact.css` and the same with `3` |
| GTK look | `tools/render-gtk.py 4 out.png --css <compiled css>` and look at the PNG; `--scale 2` for crispness |
| Extension | `npm run lint`, then `tools/build-extension.sh` and `gnome-extensions install --force build/*.zip` |
| Installer | `./install.sh -d /tmp/themes -t all` and inspect the tree |

CI runs the build, the lint, the install matrix and the GTK parsers on every push.

`tools/render-gtk.py` and `tools/check-gtk-css.py` need a display and a clean environment. From a terminal
inside a snap (VS Code, for one), run them as:

```sh
env -i PATH=/usr/bin:/bin HOME=$HOME XDG_RUNTIME_DIR=/run/user/$(id -u) WAYLAND_DISPLAY=wayland-0 tools/render-gtk.py 4 out.png
```

## Sass conventions

- Entry files in `src/gtk/*/` and `src/gnome-shell/shell-50/` configure `_config.scss` once with
  `@use ... with (...)` and load the rest plainly. Partials read the variant through `config.$variant`.
- New colours go in `_colors.scss`, new sizes and radii in `_variables.scss`. Use the glass tokens
  (`$glass-tint`, `$glass-rim`, `$glass-highlight`, `$glass-shadow`, `$radius-window/surface/control`)
  rather than new literals.
- Extending a placeholder from another module means loading that module with `@use`. Do not extend
  class selectors across modules; make a placeholder in the defining module.
- Output must parse in GTK 3: no `hsl()`, no `color-mix()`. `lighter()` and `darker()` in `_colors.scss`
  return rgb.

## Extension conventions

- One module per behaviour under `extension/src/<module>/`, each with `enable()` and `disable()` that
  leave no actor, signal, effect or timeout behind.
- Ported code is modernised to GNOME 50 conventions before it lands: ES modules, `connectObject`,
  `InjectionManager`, no `Lang`, no `imports.*`. List it in `extension/THIRD_PARTY.md` with origin,
  version and licence.
- Settings live in the schema with a prefs row each.

## Writing

Documentation and comments follow the Google developer documentation style guide, with British spelling
where the codebase already uses it. Comments explain why, not what. Describe the present state, not the
change.

## Licence

Contributions are GPL-3.0-or-later, like the rest of the tree.
