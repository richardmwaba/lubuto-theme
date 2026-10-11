// SPDX-License-Identifier: GPL-3.0-or-later
//
// The shell's Dash with two changes: the icon size is a setting rather than
// whatever fits, and icons grow under the pointer. DashItemContainer sizes
// itself from its child's scale, so a magnified icon pushes its neighbours
// apart the way the macOS dock does.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';

import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';

const MAGNIFY_TIME = 150;

export const LubutoDash = GObject.registerClass({
    GTypeName: 'LubutoDash',
}, class LubutoDash extends Dash.Dash {
    _init(getConfig) {
        this._getConfig = getConfig;
        super._init();
        this._magnified = new Set();
    }

    // Every icon takes the configured size. The stock version picks the
    // largest of a fixed list that fits the given maximum.
    _adjustIconSize() {
        const size = this._getConfig().iconSize;
        const iconChildren = this._box.get_children().filter(actor =>
            actor.child?._delegate?.icon && !actor.animatingOut);
        iconChildren.push(this._showAppsIcon);

        for (const item of iconChildren) {
            const icon = item.child._delegate.icon;
            if (icon.iconSize !== size)
                icon.setIconSize(size);
            this._hookMagnify(item);
        }

        if (this.iconSize !== size) {
            this.iconSize = size;
            this.emit('icon-size-changed');
        }
    }

    _hookMagnify(item) {
        if (this._magnified.has(item))
            return;
        this._magnified.add(item);

        const child = item.child;
        child.pivot_point = new Graphene.Point({x: 0.5, y: 1});
        child.connectObject('notify::hover', () => {
            if (!this._getConfig().magnify)
                return;
            const scale = child.hover ? this._getConfig().magnifyScale : 1;
            child.ease({
                scale_x: scale,
                scale_y: scale,
                duration: MAGNIFY_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }, this);
        item.connectObject('destroy', () => this._magnified.delete(item), this);
    }

    resetMagnify() {
        for (const item of this._magnified) {
            if (item.child)
                item.child.set_scale(1, 1);
        }
    }
});
