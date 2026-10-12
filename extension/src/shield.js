// SPDX-License-Identifier: GPL-3.0-or-later
//
// Lock screen wallpaper on every monitor.
//
// The unlock dialog blurs one wallpaper widget per monitor with a cached
// actor blur. A background actor whose box coincides with its stage position,
// which is any monitor at the stage origin, paints only the current redraw
// clip, and the cache keeps whatever the first frame painted: on a secondary
// monitor at the origin that is nothing, and the widget's black shows. A clone
// source paints its whole box, so the wallpaper actor moves into an unpainted
// holder and a clone of it takes its place under the blur.

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';

import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as UnlockDialog from 'resource:///org/gnome/shell/ui/unlockDialog.js';

export function cloneWallpaper(widget, bgManager) {
    const background = widget.get_children().find(child => child instanceof Meta.BackgroundActor);
    if (!background)
        return;

    let holder = widget.get_children().find(child => child.name === 'lubuto-shield-wallpaper');
    let clone = widget.get_children().find(child => child.name === 'lubuto-shield-wallpaper-clone');
    if (!holder) {
        holder = new Clutter.Actor({name: 'lubuto-shield-wallpaper', opacity: 0});
        clone = new Clutter.Clone({
            name: 'lubuto-shield-wallpaper-clone',
            width: widget.width,
            height: widget.height,
        });
        widget.add_child(clone);
        widget.add_child(holder);
    }

    // A wallpaper change swaps in a new actor, in the widget again.
    widget.remove_child(background);
    holder.add_child(background);
    clone.source = background;

    if (bgManager && !bgManager._lubutoShield) {
        bgManager._lubutoShield = true;
        bgManager.connect('changed', () => cloneWallpaper(widget, bgManager));
    }
}

export class ShieldModule {
    constructor() {
        this._injections = null;
    }

    enable() {
        this._injections = new InjectionManager();
        this._injections.overrideMethod(UnlockDialog.UnlockDialog.prototype, '_createBackground',
            original => function (monitorIndex) {
                original.call(this, monitorIndex);
                cloneWallpaper(this._backgroundGroup.get_last_child(), this._bgManagers.at(-1));
            });

        // A dialog that already exists keeps its backgrounds until the next
        // lock; they are fixed in place.
        const dialog = Main.screenShield?._dialog;
        if (dialog?._backgroundGroup) {
            const widgets = [...dialog._backgroundGroup];
            widgets.forEach((widget, i) => cloneWallpaper(widget, dialog._bgManagers[i]));
        }
    }

    disable() {
        this._injections?.clear();
        this._injections = null;
    }
}
