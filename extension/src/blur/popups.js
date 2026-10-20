// SPDX-License-Identifier: GPL-3.0-or-later
//
// Glass behind panel popovers. Every menu the panel's menu manager knows gets
// a backdrop below its box pointer while it is open. The backdrop follows the
// box pointer's open animation by binding its translation, scale and opacity,
// and takes its corner radius from the menu content's theme node, so it can
// never outgrow the rounded content.

import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
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
        // The box pointer is what the open animation fades, slides and
        // scales. For quick settings, menu.actor is a static overlay around it.
        const pointer = menu._boxPointer ?? menu.actor;
        const parent = pointer.get_parent();
        const monitor = Main.layoutManager.findMonitorForActor(box) ?? Main.layoutManager.primaryMonitor;
        if (!parent || !monitor)
            return;

        const backdrop = new Backdrop(monitor.index, this._getParams());
        state.backdrop = backdrop;
        backdrop.attach(parent, pointer);

        for (const prop of ['translation-x', 'translation-y', 'scale-x', 'scale-y', 'opacity']) {
            state.bindings.push(pointer.bind_property(prop, backdrop.actor, prop,
                GObject.BindingFlags.SYNC_CREATE));
        }

        box.connectObject('notify::allocation', () => this._update(menu), this);
        pointer.connectObject(
            'notify::allocation', () => this._update(menu),
            'notify::pivot-point', () => this._update(menu),
            this);
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
        if (!parent)
            return;

        // Reopening queues a relayout of the box, so its allocation is stale
        // here, and Clutter only notifies an allocation that changes. A menu
        // that reopens at the same size never notifies, so lay it out now.
        box.get_allocation_box();

        // The frame is the box's geometry without the open animation, which
        // the backdrop mirrors through its bound translation and scale. The
        // animation scales the box pointer from 0.96 about its pivot, and
        // this runs while it does: a transformed position or size read here
        // carries that scale, and a frame taken from one stays 4% small
        // after the animation ends, because a scale changes no allocation.
        // So the frame comes from allocations only: the box's offset inside
        // the box pointer, and the pointer's own allocation in its parent.
        const offset = box.apply_relative_transform_to_point(pointer, new Graphene.Point3D());
        const pointerBox = pointer.get_allocation_box();
        const originX = pointerBox.x1 + offset.x;
        const originY = pointerBox.y1 + offset.y;
        const [parentX, parentY] = parent.get_transformed_position();
        const x = parentX + originX;
        const y = parentY + originY;
        const width = box.width;
        const height = box.height;
        const radius = box.get_theme_node().get_border_radius(St.Corner.TOPLEFT);

        // The box pointer scales about its pivot; the backdrop has to scale
        // about the same point, expressed in its own box.
        const pivot = pointer.pivot_point;
        state.backdrop.actor.set_pivot_point(
            width > 0 ? (pivot.x * pointerBox.get_width() - offset.x) / width : 0,
            height > 0 ? (pivot.y * pointerBox.get_height() - offset.y) / height : 0);

        // The first open may have run before the box was styled.
        if (box.get_style() === null)
            applyTint(box, this._getParams().popoverOpacity);

        state.backdrop.frame(
            x - monitor.x, y - monitor.y, width, height, radius,
            originX, originY);
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
