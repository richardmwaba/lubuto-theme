# Third-party code in the Lubuto extension

Every module below is a fork: it was ported into this tree and is maintained here. Upstream fixes are
carried over by hand. Each listed file keeps its upstream licence header.

| Module | Files | Origin | Version ported | Licence |
| --- | --- | --- | --- | --- |
| Corners | `src/corners/effects.js`, `src/corners/shadow.js`, `src/corners/manager.js`, `src/corners/overview.js` | [Rounded Window Corners Reborn](https://github.com/flexagoon/rounded-window-corners) by flexagoon. Corner coverage shader after mutter's background shader. | 25 (GNOME 50) | GPL-3.0-or-later |
| Blur | `src/blur/effects.js` (corner coverage maths only) | Same as above | 25 | GPL-3.0-or-later |
| Wobble | `src/wobble/model.js`, `src/wobble/effect.js` | [Compiz Windows Effect for GNOME Shell](https://github.com/hermes83/compiz-windows-effect) by Mauro Pepe. Spring model by Kristian Hogsberg, David Reveman and Scott Moreau, from Compiz. | 33 | GPL-3.0-or-later |

Written for Lubuto, with ideas from elsewhere but no code: the theme loader (after user-theme), the
blur backdrops (after Blur my Shell), the dock (built on the shell's own Dash), the move module (after
Transparent Window Moving).

Lubuto itself is GPL-3.0-or-later, see `../COPYING`.
