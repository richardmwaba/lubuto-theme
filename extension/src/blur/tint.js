// SPDX-License-Identifier: GPL-3.0-or-later
//
// Glass tint strength as a live setting. The theme defines the tint colour;
// the extension keeps that colour and replaces its alpha with the setting
// through an inline style, so the slider works without recompiling the theme.

export function applyTint(actor, opacity) {
    if (!actor)
        return;
    if (opacity < 0) {
        actor.set_style(null);
        return;
    }
    // Clear first so the colour read is the stylesheet's, not a previous inline alpha.
    actor.set_style(null);
    const color = actor.get_theme_node().get_background_color();
    const alpha = Math.round(Math.min(1, Math.max(0, opacity)) * 255);
    actor.set_style(`background-color: rgba(${color.red}, ${color.green}, ${color.blue}, ${alpha / 255});`);
}

export function clearTint(actor) {
    actor?.set_style(null);
}
