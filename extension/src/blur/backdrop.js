// SPDX-License-Identifier: GPL-3.0-or-later
//
// A blurred copy of what lies behind a surface, framed to a rectangle.
//
// Two sources. 'desktop' is a live copy of the wallpaper and window actors
// (see desktop.js), so windows under the surface blur too and the result
// follows them; it costs a second paint of those windows while the surface
// shows. 'wallpaper' is the monitor background alone, painted once and cached;
// the overview uses it because the window group is hidden there.
//
// Static by design: the wallpaper rarely changes, so the blurred result is
// painted once and cached by Clutter until the background or the clip changes.

import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DesktopClone} from './desktop.js';
import {RoundedClipEffect, StaticBlurEffect} from './effects.js';

export class Backdrop {
    constructor(monitorIndex, {radius, brightness}, source = 'desktop') {
        const monitor = Main.layoutManager.monitors[monitorIndex];
        this.monitor = monitor;
        this._monitorIndex = monitorIndex;
        this._source = source;
        this._bgManager = null;
        this._clone = null;
        this._radius = radius;
        this._frame = null;

        // Two actors. The outer one is exactly the framed rectangle and is
        // what gets rounded corners. The inner one is the frame plus a margin
        // of blur radius on each side and carries the blur, so the blur never
        // samples past the edge of its texture, which would darken the rim.
        // The monitor-sized wallpaper sits inside the inner actor, offset so
        // the right part shows through.
        // Both start empty and hidden. A backdrop that has not been framed yet
        // must paint nothing: the panel layer sits above every window, and a
        // monitor-sized blurred wallpaper there hides the whole desktop.
        this.actor = new St.Widget({
            name: 'lubuto-backdrop',
            clip_to_allocation: true,
            width: 0,
            height: 0,
            visible: false,
        });
        this._blurred = new St.Widget({
            name: 'lubuto-backdrop-blur',
            width: 0,
            height: 0,
        });
        this.actor.add_child(this._blurred);

        this._blurred.connect('child-added', (container, child) => {
            if (child instanceof Meta.BackgroundActor) {
                container.set_child_below_sibling(child, null);
                this._layout();
            }
        });

        if (source === 'desktop') {
            this._clone = new DesktopClone();
            this._blurred.add_child(this._clone.actor);
        }

        this._blur = new StaticBlurEffect({brightness});
        this._blur.unscaledRadius = radius;
        this._blurred.add_effect_with_name('lubuto-blur', this._blur);
        this._corners = null;
    }

    // Parent the actor, then load the background. Loading first would map a
    // background actor with no allocation, which Clutter warns about.
    attach(parent, below = null) {
        parent.add_child(this.actor);
        if (below)
            parent.set_child_below_sibling(this.actor, below);

        if (this._source === 'wallpaper') {
            this._bgManager = new Background.BackgroundManager({
                container: this._blurred,
                monitorIndex: this._monitorIndex,
                controlPosition: false,
            });
        }
    }

    setBlur({radius, brightness}) {
        this._radius = radius;
        this._blur.unscaledRadius = radius;
        this._blur.brightness = brightness;
        this._layout();
    }

    // Show the monitor region at (x, y, width, height), monitor relative, with
    // its top-left at (originX, originY) in the parent's coordinates.
    frame(x, y, width, height, radius = 0, originX = 0, originY = 0) {
        // Positions read before the first layout pass come back NaN.
        if (![x, y, width, height, originX, originY].every(Number.isFinite))
            return;

        this._frame = {
            x: Math.floor(x),
            y: Math.floor(y),
            width: Math.max(1, Math.ceil(width)),
            height: Math.max(1, Math.ceil(height)),
            radius,
            originX,
            originY,
        };
        this._layout();
    }

    _layout() {
        const f = this._frame;
        if (!f)
            return;

        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const margin = Math.ceil(this._radius * scale * 2);
        const monitor = this.monitor;

        // Margin per side, no further than the wallpaper extends.
        const left = Math.min(margin, f.x);
        const top = Math.min(margin, f.y);
        const right = Math.min(margin, monitor.width - (f.x + f.width));
        const bottom = Math.min(margin, monitor.height - (f.y + f.height));

        this.actor.set_position(f.originX, f.originY);
        this.actor.set_size(f.width, f.height);

        this._blurred.set_position(-left, -top);
        this._blurred.set_size(f.width + left + right, f.height + top + bottom);

        for (const child of this._blurred.get_children()) {
            if (child instanceof Meta.BackgroundActor)
                child.set_position(-(f.x - left), -(f.y - top));
        }
        // The desktop copy is in stage coordinates; the frame is monitor relative.
        if (this._clone)
            this._clone.actor.set_position(-(monitor.x + f.x - left), -(monitor.y + f.y - top));

        this.actor.show();

        if (f.radius > 0) {
            if (!this._corners) {
                this._corners = new RoundedClipEffect();
                this.actor.add_effect_with_name('lubuto-corners', this._corners);
            }
            this._corners.setFrame(f.width, f.height, f.radius);
        } else if (this._corners) {
            this.actor.remove_effect(this._corners);
            this._corners = null;
        }
    }

    destroy() {
        this._bgManager?.destroy();
        this._bgManager = null;
        this._clone?.destroy();
        this._clone = null;
        this.actor?.destroy();
        this.actor = null;
        this._blurred = null;
    }
}
