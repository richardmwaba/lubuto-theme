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
// The wallpaper is painted through a clone of its background actor, never
// directly. A background actor whose box coincides with its stage position
// (a monitor at the stage origin) paints only the current redraw clip, and
// the blur caches whatever that frame painted: on the overview's second
// opening that is nothing, and the monitor shows the group's flat colour.
// A clone source paints its whole box.
//
// Static by design: the wallpaper rarely changes, so the blurred result is
// painted once and cached by Clutter until the background or the clip changes.
//
// A frame is applied one frame late, from a BEFORE_REDRAW later. Callers
// frame from allocation handlers: the dock recentres on its own allocation,
// a popover frames on its box's. A size, position or show() there queues a
// relayout after the layout pass has run, and Clutter's stage-view update
// then finds the actor without an allocation and warns, one line per actor
// per frame. The later runs ahead of the next layout pass, so the change is
// allocated in the frame it is made.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
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
        this._wallpaper = null;
        this._wallpaperHolder = null;
        this._mirrors = {};
        this._radius = radius;
        this._frame = null;
        this._layoutLater = 0;

        // Two actors. The outer one is exactly the framed rectangle and is
        // what gets rounded corners. The inner one is the frame plus a margin
        // of twice the blur radius on each side and carries the blur, so the
        // blur never samples past the edge of its texture. The monitor-sized
        // content sits inside the inner actor, offset so the right part shows
        // through, with mirrored strips where a margin leaves the monitor.
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

        if (source === 'desktop') {
            this._clone = new DesktopClone();
            this._blurred.add_child(this._clone.actor);
        } else {
            // The holder keeps the background actor mapped and allocated but
            // never painted; the clone above it is what the blur sees.
            this._wallpaperHolder = new Clutter.Actor({
                name: 'lubuto-backdrop-wallpaper',
                opacity: 0,
            });
            this._wallpaper = new Clutter.Clone({
                name: 'lubuto-backdrop-wallpaper-clone',
                width: monitor.width,
                height: monitor.height,
            });
            this._blurred.add_child(this._wallpaper);
            this._blurred.add_child(this._wallpaperHolder);
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
                container: this._wallpaperHolder,
                monitorIndex: this._monitorIndex,
                controlPosition: false,
            });
            // The manager swaps in a new actor when the wallpaper changes.
            this._bgManager.connect('changed', () => this._syncWallpaper());
            this._syncWallpaper();
        }
    }

    _syncWallpaper() {
        if (this._wallpaper)
            this._wallpaper.source = this._bgManager?.backgroundActor ?? null;
    }

    setBlur({radius, brightness}) {
        this._radius = radius;
        this._blur.unscaledRadius = radius;
        this._blur.brightness = brightness;
        this._queueLayout();
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
        this._queueLayout();
    }

    _queueLayout() {
        if (this._layoutLater || !this.actor)
            return;
        this._layoutLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._layoutLater = 0;
            this._layout();
            return GLib.SOURCE_REMOVE;
        });
    }

    _layout() {
        const f = this._frame;
        if (!f || !this.actor)
            return;

        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const margin = Math.ceil(this._radius * scale * 2);
        const monitor = this.monitor;

        this.actor.set_position(f.originX, f.originY);
        this.actor.set_size(f.width, f.height);

        // The blurred actor carries the full margin on every side, so the
        // blur samples its own texture only. Where the monitor ends inside
        // a margin, the part past the edge is filled with the content
        // mirrored across that edge, the usual padding for a blur: left
        // transparent, it pulls the edge of the surface towards black.
        this._blurred.set_position(-margin, -margin);
        this._blurred.set_size(f.width + 2 * margin, f.height + 2 * margin);

        // Monitor origin in the blurred actor's coordinates.
        const monitorX = margin - f.x;
        const monitorY = margin - f.y;
        if (this._wallpaper)
            this._wallpaper.set_position(monitorX, monitorY);
        // The desktop copy is in stage coordinates; the frame is monitor relative.
        if (this._clone)
            this._clone.actor.set_position(monitorX - monitor.x, monitorY - monitor.y);

        this._layoutMirrors(f, margin, monitorX, monitorY);

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

    // One strip per side whose margin runs past the monitor, holding a
    // clone of the content flipped across that edge, clipped to the strip.
    _layoutMirrors(f, margin, monitorX, monitorY) {
        const monitor = this.monitor;
        const content = this._clone?.actor ?? this._wallpaper;
        const contentX = content.x;
        const contentY = content.y;
        const width = f.width + 2 * margin;
        const height = f.height + 2 * margin;
        const edges = {
            top: {
                short: margin - Math.min(margin, f.y),
                place: strip => {
                    const edge = monitorY;
                    strip.set_position(0, edge - strip.short);
                    strip.set_size(width, strip.short);
                    strip.clone.set_scale(1, -1);
                    strip.clone.set_position(contentX, edge - contentY + strip.short);
                },
            },
            bottom: {
                short: margin - Math.min(margin, monitor.height - (f.y + f.height)),
                place: strip => {
                    const edge = monitorY + monitor.height;
                    strip.set_position(0, edge);
                    strip.set_size(width, strip.short);
                    strip.clone.set_scale(1, -1);
                    strip.clone.set_position(contentX, edge - contentY);
                },
            },
            left: {
                short: margin - Math.min(margin, f.x),
                place: strip => {
                    const edge = monitorX;
                    strip.set_position(edge - strip.short, 0);
                    strip.set_size(strip.short, height);
                    strip.clone.set_scale(-1, 1);
                    strip.clone.set_position(edge - contentX + strip.short, contentY);
                },
            },
            right: {
                short: margin - Math.min(margin, monitor.width - (f.x + f.width)),
                place: strip => {
                    const edge = monitorX + monitor.width;
                    strip.set_position(edge, 0);
                    strip.set_size(strip.short, height);
                    strip.clone.set_scale(-1, 1);
                    strip.clone.set_position(edge - contentX, contentY);
                },
            },
        };

        for (const [side, {short, place}] of Object.entries(edges)) {
            let strip = this._mirrors[side];
            if (short <= 0) {
                strip?.destroy();
                delete this._mirrors[side];
                continue;
            }
            if (!strip) {
                strip = new St.Widget({name: `lubuto-backdrop-mirror-${side}`, clip_to_allocation: true});
                strip.clone = new Clutter.Clone({source: content});
                strip.add_child(strip.clone);
                this._blurred.add_child(strip);
                this._mirrors[side] = strip;
            }
            strip.short = short;
            place(strip);
        }
    }

    destroy() {
        if (this._layoutLater) {
            global.compositor.get_laters().remove(this._layoutLater);
            this._layoutLater = 0;
        }
        this._bgManager?.destroy();
        this._bgManager = null;
        this._clone?.destroy();
        this._clone = null;
        this.actor?.destroy();
        this.actor = null;
        this._blurred = null;
        this._wallpaper = null;
        this._wallpaperHolder = null;
        this._mirrors = {};
    }
}
