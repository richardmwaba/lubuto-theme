// SPDX-License-Identifier: GPL-3.0-or-later
//
// A shadow actor under a rounded window. Rounding the window clips mutter's
// own shadow where the corners used to be, so each rounded window gets a
// St.Bin with a CSS box-shadow, bound to the window actor's geometry.
//
// Ported from Rounded Window Corners Reborn by flexagoon (GPL-3.0-or-later).

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {ClipShadowEffect} from './effects.js';

export const SHADOW_PADDING = 80;

const FOCUSED_SHADOW = 'box-shadow: 0 4px 40px 4px rgba(0, 0, 0, 0.5);';
const UNFOCUSED_SHADOW = 'box-shadow: 0 2px 24px 2px rgba(0, 0, 0, 0.35);';

export function createShadow(actor) {
    const shadow = new St.Bin({
        name: 'lubuto-window-shadow',
        child: new St.Bin({xExpand: true, yExpand: true}),
    });
    shadow.add_effect_with_name('lubuto-clip-shadow', new ClipShadowEffect());

    global.windowGroup.insert_child_below(shadow, actor);

    // Position, size, and the transforms the shell animates on the window.
    for (let coordinate = 0; coordinate < 4; coordinate++)
        shadow.add_constraint(new Clutter.BindConstraint({source: actor, coordinate, offset: 0}));

    const bindings = [];
    for (const prop of ['pivot-point', 'translation-x', 'translation-y', 'scale-x', 'scale-y', 'visible'])
        bindings.push(actor.bind_property(prop, shadow, prop, GObject.BindingFlags.SYNC_CREATE));

    return {shadow, bindings};
}

export function destroyShadow({shadow, bindings}) {
    for (const binding of bindings)
        binding.unbind();
    for (const constraint of shadow.get_constraints())
        shadow.remove_constraint(constraint);
    global.windowGroup.remove_child(shadow);
    shadow.clear_effects();
    shadow.destroy();
}

// contentsOffset is the frame rect relative to the buffer rect: x, y, dw, dh.
export function updateShadow(win, shadow, radius, contentsOffset, {hidden}) {
    const [x, y, dw, dh] = contentsOffset;
    const offsets = [x - SHADOW_PADDING, y - SHADOW_PADDING, 2 * SHADOW_PADDING + dw, 2 * SHADOW_PADDING + dh];
    shadow.get_constraints().forEach((constraint, i) => {
        if (constraint instanceof Clutter.BindConstraint)
            constraint.offset = offsets[i];
    });

    shadow.style = `padding: ${SHADOW_PADDING}px;`;

    const style = hidden
        ? 'opacity: 0;'
        : `background: white; border-radius: ${radius}px; ${win.appears_focused ? FOCUSED_SHADOW : UNFOCUSED_SHADOW}`;
    const child = shadow.firstChild;
    if (child.style !== style) {
        child.style = style;
        child.queue_redraw();
    }
}
