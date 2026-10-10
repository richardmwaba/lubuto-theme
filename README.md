# Lubuto

Lubuto (Bemba: light) is a GNOME 50 theme with a Liquid Glass look, forked from
[Orchis](https://github.com/vinceliuice/Orchis-theme) by vinceliuice.

Lubuto targets one platform: GNOME Shell 50 on Wayland, with GTK 3, GTK 4 and libadwaita. It ships as a
theme directory and, from Phase 2 of the plan, a single shell extension that loads the shell stylesheet and
provides blur, rounded window corners, a dock and window effects.

The project is under construction. See [the plan](docs/PLAN.md) for scope, architecture and status.

## Requirements

- GNOME Shell 50 or later
- GTK 3.24 or later, GTK 4, libadwaita
- `node` and `npm` for the pinned Dart Sass build (`sass-embedded`; a global `sass` also works)

## Install

```sh
./install.sh -t teal -c dark -s compact
```

`./install.sh --help` lists every option. The colour, light and dark, size and tweak flags are the Orchis ones.

Link the GTK 4 theme for libadwaita apps:

```sh
./install.sh -t teal -c dark -s compact -l
```

Remove every installed variant:

```sh
./install.sh -r
```

## Build the stylesheets only

```sh
npm ci
./parse-sass.sh
```

## Licence

GPL-3.0-or-later, see [COPYING](COPYING). Orchis is by vinceliuice and is based on
[materia-theme](https://github.com/nana-4/materia-theme) by nana-4.
