// SPDX-License-Identifier: GPL-3.0-or-later
//
// Wobble module: windows wobble while dragged and when they maximize or
// unmaximize.

import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {WobblyEffect} from './effect.js';

const EFFECT_NAME = 'lubuto-wobble';
const MOVE_OPS = [Meta.GrabOp.MOVING, Meta.GrabOp.MOVING_UNCONSTRAINED];

export class WobbleModule {
    constructor(settings) {
        this._settings = settings;
        this._resizing = null;
    }

    enable() {
        global.display.connectObject(
            'grab-op-begin', (_display, win, op) => this._onGrabBegin(win, op),
            'grab-op-end', (_display, win) => this._onGrabEnd(win),
            this);
        global.windowManager.connectObject(
            'size-change', (_wm, actor, change) => this._onSizeChange(actor, change),
            'size-changed', (_wm, actor) => this._onSizeChanged(actor),
            'destroy', (_wm, actor) => this._clear(actor),
            this);
    }

    disable() {
        global.display.disconnectObject(this);
        global.windowManager.disconnectObject(this);
        for (const actor of global.get_window_actors())
            this._clear(actor);
    }

    _enabled() {
        return this._settings.get_boolean('wobble-enabled');
    }

    _config() {
        return {
            friction: this._settings.get_double('wobble-friction'),
            spring: this._settings.get_double('wobble-spring'),
            speedup: this._settings.get_double('wobble-speedup'),
            mass: this._settings.get_double('wobble-mass'),
            tiles: this._settings.get_int('wobble-tiles'),
        };
    }

    _clear(actor) {
        actor?.get_effect(EFFECT_NAME)?.finish();
    }

    _start(actor, op) {
        this._clear(actor);
        actor.add_effect_with_name(EFFECT_NAME, new WobblyEffect({config: this._config(), op}));
    }

    _onGrabBegin(win, op) {
        if (!this._enabled() || !win || !MOVE_OPS.includes(op))
            return;
        const actor = win.get_compositor_private();
        if (actor)
            this._start(actor, 'move');
    }

    _onGrabEnd(win) {
        win?.get_compositor_private()?.get_effect(EFFECT_NAME)?.release();
    }

    _onSizeChange(actor, change) {
        if (!actor)
            return;
        this._resizing = {actor, rect: actor.metaWindow.get_frame_rect()};

        if (!this._enabled() || change !== Meta.SizeChange.UNMAXIMIZE || !this._settings.get_boolean('wobble-maximize'))
            return;
        if (actor.get_effect(EFFECT_NAME)?.operation !== 'move')
            this._start(actor, 'unmaximize');
    }

    _onSizeChanged(actor) {
        const pending = this._resizing;
        this._resizing = null;
        if (!actor || pending?.actor !== actor || !this._enabled())
            return;

        const win = actor.metaWindow;
        const flags = win.get_maximize_flags();
        if (!flags) {
            // A window still being dragged keeps wobbling with its new size.
            if (actor.get_effect(EFFECT_NAME)?.operation === 'move')
                this._start(actor, 'move');
            return;
        }

        this._clear(actor);
        if (!this._settings.get_boolean('wobble-maximize'))
            return;

        const monitor = Main.layoutManager.monitors[win.get_monitor()];
        const before = pending.rect;
        const after = win.get_frame_rect();
        const touchesEdge = (r, edge) => edge === 'left' ? r.x === monitor.x : r.x + r.width === monitor.x + monitor.width;
        const verticalToEdge = flags === Meta.MaximizeFlags.VERTICAL && (
            before.y !== after.y ||
            before.y + before.height !== after.y + after.height ||
            touchesEdge(before, 'left') !== touchesEdge(after, 'left') ||
            touchesEdge(before, 'right') !== touchesEdge(after, 'right'));

        if (flags === Meta.MaximizeFlags.BOTH || verticalToEdge)
            this._start(actor, 'maximize');
    }
}
