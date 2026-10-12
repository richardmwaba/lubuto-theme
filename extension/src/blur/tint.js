// SPDX-License-Identifier: GPL-3.0-or-later
//
// Glass tint strength as a live setting. The theme defines the tint colour;
// the extension keeps that colour and replaces its alpha with the setting
// through an inline style, so the slider works without recompiling the theme.

export function applyTint(actor, opacity) {
    if (!actor)
        return;
    if (opacity < 0) {
        clearTint(actor);
        return;
    }

    // Read the stylesheet's colour, not a previous inline alpha, and only once
    // the node is styled: an unstyled node reports transparent black, and a
    // tint built on that is a different colour.
    const previous = actor.get_style();
    actor.set_style(null);
    actor.ensure_style();
    const color = actor.get_theme_node().get_background_color();
    if (color.alpha === 0) {
        actor.set_style(previous);
        return;
    }

    const alpha = Math.min(1, Math.max(0, opacity));
    const style = `background-color: rgba(${color.red}, ${color.green}, ${color.blue}, ${alpha});`;
    if (style !== previous)
        actor.set_style(style);
    else
        actor.set_style(previous);
}

export function clearTint(actor) {
    if (actor && actor.get_style() !== null)
        actor.set_style(null);
}
