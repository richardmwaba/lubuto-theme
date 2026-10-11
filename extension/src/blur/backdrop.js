// SPDX-License-Identifier: GPL-3.0-or-later
//
// A blurred copy of one monitor's wallpaper, clipped to a rectangle. The actor
// is monitor sized; the clip selects the part under the surface being glassed,
// and the actor is moved so that part lands at the parent's origin.
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

        this.actor = new St.Widget({
            name: 'lubuto-backdrop',
            width: monitor.width,
            height: monitor.height,
        });

        this._monitorIndex = monitorIndex;
        this._bgManager = null;

        // BackgroundManager adds its actor later; keep it below anything else.
        this.actor.connect('child-added', (container, child) => {
            if (child instanceof Meta.BackgroundActor)
                container.set_child_below_sibling(child, null);
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
    // the region's top-left at (originX, originY) in the parent's coordinates.
    frame(x, y, width, height, radius = 0, originX = 0, originY = 0) {
        const cx = Math.floor(x);
        const cy = Math.floor(y);
        const cw = Math.ceil(width);
        const ch = Math.ceil(height);

        this.actor.set_clip(cx, cy, cw, ch);
        this.actor.set_position(originX - cx, originY - cy);

        if (radius > 0) {
            if (!this._corners) {
                this._corners = new RoundedClipEffect();
                this.actor.add_effect_with_name('lubuto-corners', this._corners);
            }
            this._corners.setFrame(cw, ch, radius);
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
