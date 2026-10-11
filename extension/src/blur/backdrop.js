// SPDX-License-Identifier: GPL-3.0-or-later
//
// A blurred copy of one monitor's wallpaper, framed to a rectangle. The actor
// is the size of the frame; the monitor-sized wallpaper inside it is offset so
// the part under the glassed surface shows.
//
// Static by design: the wallpaper rarely changes, so the blurred result is
// painted once and cached by Clutter until the background or the clip changes.

import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {RoundedClipEffect, StaticBlurEffect} from './effects.js';

export class Backdrop {
    constructor(monitorIndex, {radius, brightness}) {
        const monitor = Main.layoutManager.monitors[monitorIndex];
        this.monitor = monitor;
        this._monitorIndex = monitorIndex;
        this._bgManager = null;
        this._offset = [0, 0];

        // The actor is exactly the framed rectangle. Effects render the actor
        // into a texture of its own size, so the corner shader's coordinates
        // match the frame. The monitor-sized wallpaper sits inside, offset so
        // the right part shows through.
        this.actor = new St.Widget({
            name: 'lubuto-backdrop',
            clip_to_allocation: true,
            width: monitor.width,
            height: monitor.height,
        });

        this.actor.connect('child-added', (container, child) => {
            if (child instanceof Meta.BackgroundActor) {
                container.set_child_below_sibling(child, null);
                child.set_position(...this._offset);
            }
        });

        this._blur = new StaticBlurEffect({brightness});
        this._blur.unscaledRadius = radius;
        this.actor.add_effect_with_name('lubuto-blur', this._blur);
        this._corners = null;
    }

    // Parent the actor, then load the background. Loading first would map a
    // background actor with no allocation, which Clutter warns about.
    attach(parent, below = null) {
        parent.add_child(this.actor);
        if (below)
            parent.set_child_below_sibling(this.actor, below);

        this._bgManager = new Background.BackgroundManager({
            container: this.actor,
            monitorIndex: this._monitorIndex,
            controlPosition: false,
        });
    }

    setBlur({radius, brightness}) {
        this._blur.unscaledRadius = radius;
        this._blur.brightness = brightness;
    }

    // Show the monitor region at (x, y, width, height), monitor relative, with
    // its top-left at (originX, originY) in the parent's coordinates.
    frame(x, y, width, height, radius = 0, originX = 0, originY = 0) {
        const fx = Math.floor(x);
        const fy = Math.floor(y);
        const fw = Math.max(1, Math.ceil(width));
        const fh = Math.max(1, Math.ceil(height));

        this._offset = [-fx, -fy];
        this.actor.set_position(originX, originY);
        this.actor.set_size(fw, fh);
        for (const child of this.actor.get_children()) {
            if (child instanceof Meta.BackgroundActor)
                child.set_position(-fx, -fy);
        }

        if (radius > 0) {
            if (!this._corners) {
                this._corners = new RoundedClipEffect();
                this.actor.add_effect_with_name('lubuto-corners', this._corners);
            }
            this._corners.setFrame(fw, fh, radius);
        } else if (this._corners) {
            this.actor.remove_effect(this._corners);
            this._corners = null;
        }
    }

    destroy() {
        this._bgManager?.destroy();
        this._bgManager = null;
        this.actor?.destroy();
        this.actor = null;
    }
}
