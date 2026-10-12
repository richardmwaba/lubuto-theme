// SPDX-License-Identifier: GPL-3.0-or-later
//
// Move module: a window turns translucent while it is dragged or resized and
// returns to its own opacity when the grab ends.

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';

const MOVE_OPS = new Set([
    Meta.GrabOp.MOVING,
    Meta.GrabOp.KEYBOARD_MOVING,
    Meta.GrabOp.MOVING_UNCONSTRAINED,
]);

const RESIZE_OPS = new Set([
    Meta.GrabOp.RESIZING_NW, Meta.GrabOp.RESIZING_N, Meta.GrabOp.RESIZING_NE,
    Meta.GrabOp.RESIZING_E, Meta.GrabOp.RESIZING_SW, Meta.GrabOp.RESIZING_S,
    Meta.GrabOp.RESIZING_SE, Meta.GrabOp.RESIZING_W,
    Meta.GrabOp.KEYBOARD_RESIZING_UNKNOWN,
    Meta.GrabOp.KEYBOARD_RESIZING_NW, Meta.GrabOp.KEYBOARD_RESIZING_N,
    Meta.GrabOp.KEYBOARD_RESIZING_NE, Meta.GrabOp.KEYBOARD_RESIZING_E,
    Meta.GrabOp.KEYBOARD_RESIZING_SW, Meta.GrabOp.KEYBOARD_RESIZING_S,
    Meta.GrabOp.KEYBOARD_RESIZING_SE, Meta.GrabOp.KEYBOARD_RESIZING_W,
]);

// The surface actors paint the window contents; fading them keeps mutter's
// own shadow and frame untouched.
function surfacesOf(actor) {
    if (actor instanceof Meta.SurfaceActor)
        return [actor];
    return actor.get_children().flatMap(child => surfacesOf(child));
}

export class MoveModule {
    constructor(settings) {
        this._settings = settings;
        this._original = new Map();
    }

    enable() {
        global.display.connectObject(
            'grab-op-begin', (_display, win, op) => this._onGrabBegin(win, op),
            'grab-op-end', (_display, win, op) => this._onGrabEnd(win, op),
            this);
    }

    disable() {
        global.display.disconnectObject(this);
        for (const [win, opacity] of this._original)
            this._fade(win, opacity, 0);
        this._original.clear();
    }

    _applies(op) {
        if (!this._settings.get_boolean('move-enabled'))
            return false;
        if (MOVE_OPS.has(op))
            return true;
        return RESIZE_OPS.has(op) && this._settings.get_boolean('move-on-resize');
    }

    _onGrabBegin(win, op) {
        if (!win || !this._applies(op))
            return;
        const actor = win.get_compositor_private();
        if (!actor)
            return;

        const surfaces = surfacesOf(actor);
        if (surfaces.length === 0)
            return;
        if (!this._original.has(win))
            this._original.set(win, surfaces[0].opacity);

        this._fade(win, this._settings.get_int('move-opacity'), this._settings.get_int('move-duration'));
    }

    _onGrabEnd(win, op) {
        if (!win || !this._applies(op) || !this._original.has(win))
            return;
        const opacity = this._original.get(win);
        this._original.delete(win);
        this._fade(win, opacity, this._settings.get_int('move-duration'));
    }

    _fade(win, opacity, duration) {
        const actor = win.get_compositor_private();
        if (!actor)
            return;
        for (const surface of surfacesOf(actor)) {
            surface.remove_all_transitions();
            if (duration > 0)
                surface.ease({opacity, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            else
                surface.opacity = opacity;
        }
    }
}
