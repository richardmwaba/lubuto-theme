// SPDX-License-Identifier: GPL-3.0-or-later
//
// A live copy of the desktop layer for blurring: the wallpaper actors and
// every window actor, each cloned on its own.
//
// Cloning the window group itself is the obvious way and it is wrong: painting
// the group runs mutter's culling pass against the clone's framebuffer, which
// leaves stale clip regions on the wallpaper and windows and shows up as a
// band on the desktop. Per-actor clones skip the group, so no culling runs.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';

import {isDisposed} from '../disposed.js';

export class DesktopClone {
    constructor() {
        this.actor = new Clutter.Actor({name: 'lubuto-desktop-clone'});
        this._clones = new Map();
        this._rebuild();

        global.window_group.connectObject(
            'child-added', () => this._rebuild(),
            'child-removed', () => this._rebuild(),
            this);
        global.display.connectObject('restacked', () => this._rebuild(), this);
        // At shell shutdown the stage goes away from C with the clones in
        // it, while windows keep closing and the signals above keep firing.
        this.actor.connect('destroy', () => this._release());
    }

    destroy() {
        const actor = this.actor;
        this._release();
        actor?.destroy();
    }

    _release() {
        global.window_group.disconnectObject(this);
        global.display.disconnectObject(this);
        this._clear();
        this.actor = null;
    }

    _clear() {
        for (const {clone, bindings} of this._clones.values()) {
            for (const binding of bindings) {
                if (!isDisposed(binding))
                    binding.unbind();
            }
            if (!isDisposed(clone))
                clone.destroy();
        }
        this._clones.clear();
    }

    // Sources in paint order: background actors inside background groups,
    // then window actors. Anything else in the window group is skipped.
    _sources() {
        const sources = [];
        for (const child of global.window_group.get_children()) {
            if (child instanceof Meta.BackgroundGroup) {
                for (const bg of child.get_children()) {
                    if (bg instanceof Meta.BackgroundActor)
                        sources.push(bg);
                }
            } else if (child instanceof Meta.WindowActor) {
                sources.push(child);
            }
        }
        return sources;
    }

    _rebuild() {
        if (!this.actor)
            return;

        const sources = this._sources();
        const wanted = new Set(sources);

        for (const [source, entry] of [...this._clones]) {
            if (!wanted.has(source)) {
                for (const binding of entry.bindings)
                    binding.unbind();
                entry.clone.destroy();
                this._clones.delete(source);
            }
        }

        for (const source of sources) {
            if (this._clones.has(source))
                continue;
            const clone = new Clutter.Clone({source});
            // Window actors move and resize; background actors are static but
            // the same bindings cost nothing. Minimized windows are unmapped,
            // and a clone would paint them anyway, so visibility follows too.
            const bindings = ['x', 'y', 'width', 'height', 'visible', 'opacity', 'scale-x', 'scale-y',
                'translation-x', 'translation-y', 'pivot-point']
                .map(prop => source.bind_property(prop, clone, prop, GObject.BindingFlags.SYNC_CREATE));
            // Background actors live inside a background group; the group's own
            // position is what the window group sees.
            const parent = source.get_parent();
            if (parent instanceof Meta.BackgroundGroup) {
                clone.x = parent.x + source.x;
                clone.y = parent.y + source.y;
            }
            this.actor.add_child(clone);
            this._clones.set(source, {clone, bindings});
        }

        // Match stacking order.
        let previous = null;
        for (const source of sources) {
            const {clone} = this._clones.get(source);
            if (previous)
                this.actor.set_child_above_sibling(clone, previous);
            else
                this.actor.set_child_below_sibling(clone, null);
            previous = clone;
        }
    }
}
