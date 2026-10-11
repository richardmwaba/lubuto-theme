// SPDX-License-Identifier: GPL-3.0-or-later
//
// Applies rounded corners to window actors and keeps them in sync with the
// window's size, state and focus.
//
// Ported from Rounded Window Corners Reborn by flexagoon (GPL-3.0-or-later).
// Lubuto version: one radius for every window, no per-app overrides, no
// whitelist mode, signal tracking through connectObject.

import Meta from 'gi://Meta';
import St from 'gi://St';

import {WindowCornersEffect} from './effects.js';
import {createShadow, destroyShadow, updateShadow} from './shadow.js';

const EFFECT_NAME = 'lubuto-window-corners';

const ROUNDABLE_TYPES = [Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG];

// X11 clients paint into the actor's first child; Wayland clients into the actor.
function surfaceOf(actor) {
    return actor.metaWindow.get_client_type() === Meta.WindowClientType.X11
        ? actor.get_first_child()
        : actor;
}

export class WindowCorners {
    constructor(getConfig) {
        this._getConfig = getConfig;
        this._state = new Map();
    }

    enable() {
        for (const actor of global.get_window_actors()) {
            if (actor.metaWindow)
                this._watch(actor);
        }

        global.display.connectObject(
            'window-created', (_display, win) => this._onWindowCreated(win),
            'restacked', () => this._restack(),
            this);
        global.windowManager.connectObject(
            'destroy', (_wm, actor) => this._unwatch(actor),
            this);
    }

    disable() {
        global.display.disconnectObject(this);
        global.windowManager.disconnectObject(this);
        for (const actor of [...this._state.keys()])
            this._unwatch(actor);
    }

    refreshAll() {
        for (const actor of this._state.keys())
            this._refresh(actor);
    }

    shadowOf(actor) {
        return this._state.get(actor)?.shadow?.shadow ?? null;
    }

    isRounded(actor) {
        return Boolean(this._state.get(actor)?.rounded);
    }

    _onWindowCreated(win) {
        const actor = win.get_compositor_private();
        if (!actor)
            return;

        // The class may arrive after creation; the effect decision needs it.
        if (win.wmClass === null) {
            win.connectObject('notify::wm-class', () => {
                win.disconnectObject(this);
                this._watch(actor);
            }, this);
        } else {
            this._watch(actor);
        }
    }

    _watch(actor) {
        if (this._state.has(actor) || !actor.metaWindow)
            return;

        // XWayland surfaces may not exist yet when the window is created.
        if (!actor.firstChild) {
            actor.connectObject('notify::first-child', () => {
                actor.disconnectObject(this);
                this._watch(actor);
            }, this);
            return;
        }

        const texture = actor.get_texture();
        if (!texture)
            return;

        this._state.set(actor, {rounded: false, shadow: null});

        // Window actors can go away without a window-manager destroy signal,
        // for example when Xwayland restarts on a monitor hotplug.
        actor.connectObject(
            'destroy', () => this._unwatch(actor, {disposed: true}),
            'notify::size', () => this._refresh(actor),
            this);
        texture.connectObject('size-changed', () => this._refresh(actor), this);
        actor.metaWindow.connectObject(
            'notify::fullscreen', () => this._refresh(actor),
            'notify::appears-focused', () => this._refresh(actor),
            'workspace-changed', () => this._refresh(actor),
            this);

        this._refresh(actor);
    }

    _unwatch(actor, {disposed = false} = {}) {
        const state = this._state.get(actor);
        if (!state)
            return;

        this._state.delete(actor);
        if (disposed) {
            // The actor and its texture are gone; only our own shadow remains.
            if (state.shadow)
                destroyShadow(state.shadow);
            return;
        }

        actor.disconnectObject(this);
        actor.get_texture()?.disconnectObject(this);
        actor.metaWindow?.disconnectObject(this);
        this._remove(actor, state);
    }

    _shouldRound(win) {
        const config = this._getConfig();
        if (win.wmClass === null || config.blacklist.includes(win.wmClass))
            return false;
        if (!ROUNDABLE_TYPES.includes(win.windowType))
            return false;

        const maximized = win.maximizedHorizontally || win.maximizedVertically;
        if (win.fullscreen)
            return config.keepFullscreen;
        if (maximized)
            return config.keepMaximized;
        return true;
    }

    _refresh(actor) {
        const state = this._state.get(actor);
        const win = actor.metaWindow;
        if (!state || !win)
            return;

        const want = this._shouldRound(win);
        if (want && !state.rounded)
            this._apply(actor, state);
        else if (!want && state.rounded)
            this._remove(actor, state);

        if (state.rounded)
            this._update(actor, state);
    }

    _apply(actor, state) {
        surfaceOf(actor)?.add_effect_with_name(EFFECT_NAME, new WindowCornersEffect());
        if (this._getConfig().shadow)
            state.shadow = createShadow(actor);
        state.rounded = true;
    }

    _remove(actor, state) {
        surfaceOf(actor)?.remove_effect_by_name(EFFECT_NAME);
        if (state.shadow) {
            destroyShadow(state.shadow);
            state.shadow = null;
        }
        state.rounded = false;
    }

    _update(actor, state) {
        const win = actor.metaWindow;
        const effect = surfaceOf(actor)?.get_effect(EFFECT_NAME);
        if (!effect)
            return;

        const config = this._getConfig();
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const radius = config.radius * scale;

        const buffer = win.get_buffer_rect();
        const frame = win.get_frame_rect();
        const contentsOffset = [
            frame.x - buffer.x,
            frame.y - buffer.y,
            frame.width - buffer.width,
            frame.height - buffer.height,
        ];

        const [x, y, dw, dh] = contentsOffset;
        effect.update({
            x1: x + 1,
            y1: y + 1,
            x2: x + actor.width + dw,
            y2: y + actor.height + dh,
        }, radius);

        if (state.shadow) {
            const hidden = win.maximizedHorizontally || win.maximizedVertically || win.fullscreen;
            updateShadow(win, state.shadow.shadow, config.radius, contentsOffset, {hidden});
        }
    }

    _restack() {
        for (const [actor, state] of this._state) {
            if (!state.shadow || !actor.get_parent())
                continue;
            if (actor.visible)
                global.windowGroup.set_child_below_sibling(state.shadow.shadow, actor);
        }
    }
}
