// SPDX-License-Identifier: GPL-3.0-or-later
//
// Glass behind panel popovers. Every menu the panel's menu manager knows gets
// a backdrop below its box pointer while it is open. The backdrop follows the
// box pointer's open animation by binding its translation and opacity, and
// takes its corner radius from the menu content's theme node, so it can never
// outgrow the rounded content.

import GObject from 'gi://GObject';
import St from 'gi://St';

import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Backdrop} from './backdrop.js';
import {applyTint, clearTint} from './tint.js';

export class PopupBlur {
    constructor(getParams) {
        this._getParams = getParams;
        this._injections = null;
        this._tracked = new Map();
    }

    enable() {
        this._injections = new InjectionManager();
        const self = this;
        this._injections.overrideMethod(PopupMenu.PopupMenuManager.prototype, 'addMenu',
            original => function (menu, position) {
                original.call(this, menu, position);
                self._track(menu);
            });

        for (const menu of Main.panel.menuManager._menus)
            this._track(menu);
    }

    disable() {
        this._injections?.clear();
        this._injections = null;

        for (const menu of [...this._tracked.keys()])
            this._untrack(menu);
    }

    updateParams() {
        const params = this._getParams();
        for (const [menu, state] of this._tracked) {
            state.backdrop?.setBlur(params);
            if (state.backdrop)
                applyTint(menu.box, params.popoverOpacity);
        }
    }

    _track(menu) {
        if (this._tracked.has(menu) || !menu.box || !menu.actor)
            return;

        const state = {backdrop: null, bindings: []};
        this._tracked.set(menu, state);

        menu.connectObject(
            'open-state-changed', (_menu, open) => open ? this._show(menu) : this._hide(menu),
            'destroy', () => this._untrack(menu),
            this);

        if (menu.isOpen)
            this._show(menu);
    }

    _untrack(menu) {
        this._hide(menu);
        menu.disconnectObject(this);
        this._tracked.delete(menu);
    }

    _show(menu) {
        const state = this._tracked.get(menu);
        if (!state || state.backdrop)
            return;

        const box = menu.box;
        // The box pointer is what the open animation fades and slides. For
        // quick settings, menu.actor is a static overlay around it.
        const pointer = menu._boxPointer ?? menu.actor;
        const parent = pointer.get_parent();
        const monitor = Main.layoutManager.findMonitorForActor(box) ?? Main.layoutManager.primaryMonitor;
        if (!parent || !monitor)
            return;

        const backdrop = new Backdrop(monitor.index, this._getParams());
        state.backdrop = backdrop;
        backdrop.attach(parent, pointer);

        for (const prop of ['translation-x', 'translation-y', 'opacity']) {
            state.bindings.push(pointer.bind_property(prop, backdrop.actor, prop,
                GObject.BindingFlags.SYNC_CREATE));
        }

        box.connectObject('notify::allocation', () => this._update(menu), this);
        pointer.connectObject('notify::allocation', () => this._update(menu), this);
        applyTint(box, this._getParams().popoverOpacity);
        this._update(menu);
    }

    _update(menu) {
        const state = this._tracked.get(menu);
        if (!state?.backdrop)
            return;

        const box = menu.box;
        const pointer = menu._boxPointer ?? menu.actor;
        const parent = pointer.get_parent();
        const monitor = state.backdrop.monitor;
        if (!box.has_allocation() || !parent)
            return;

        // Positions without the open animation's translation, which the
        // backdrop mirrors through its own bound translation.
        const [boxX, boxY] = box.get_transformed_position();
        const [parentX, parentY] = parent.get_transformed_position();
        const x = boxX - pointer.translation_x;
        const y = boxY - pointer.translation_y;
        const [width, height] = box.get_transformed_size();
        const radius = box.get_theme_node().get_border_radius(St.Corner.TOPLEFT);

        state.backdrop.frame(
            x - monitor.x, y - monitor.y, width, height, radius,
            x - parentX, y - parentY);
    }

    _hide(menu) {
        const state = this._tracked.get(menu);
        if (!state?.backdrop)
            return;

        menu.box.disconnectObject(this);
        (menu._boxPointer ?? menu.actor).disconnectObject(this);
        for (const binding of state.bindings)
            binding.unbind();
        state.bindings = [];

        state.backdrop.destroy();
        state.backdrop = null;
        clearTint(menu.box);
    }
}

