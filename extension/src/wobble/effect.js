// SPDX-License-Identifier: GPL-3.0-or-later
//
// Deforms a window actor through the spring model. The 4x4 model points are
// the control points of a bicubic Bézier patch; the deform effect samples that
// patch on an N x N tile grid every frame.
//
// From Compiz Windows Effect for GNOME Shell by Mauro Pepe
// (GPL-3.0-or-later). Lubuto version: resize effect dropped, signals tracked
// with connectObject, Bézier weights computed in a loop.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {WobblyModel} from './model.js';

const TIMELINE_DURATION = 1000 * 1000;

function bernstein(t) {
    const u = 1 - t;
    return [u * u * u, 3 * t * u * u, 3 * t * t * u, t * t * t];
}

export const WobblyEffect = GObject.registerClass({
    GTypeName: 'LubutoWobblyEffect',
}, class WobblyEffect extends Clutter.DeformEffect {
    constructor({config, op}) {
        super();
        this._config = config;
        this.operation = op;
        this._tiles = op === 'maximize' ? 10 : config.tiles;
        this.set_n_tiles(this._tiles, this._tiles);

        this._model = null;
        this._timeline = null;
        this._weights = null;
        this._points = null;
        this._ended = false;
        this._initialized = false;
        this._deltaX = 0;
        this._deltaY = 0;
        this._lastMsec = 0;
    }

    vfunc_set_actor(actor) {
        super.vfunc_set_actor(actor);
        if (!actor || this._initialized)
            return;
        this._initialized = true;

        [this._width, this._height] = actor.get_size();
        [this._x, this._y] = actor.get_position();
        const n = this._tiles;

        this._weights = [];
        this._points = [];
        for (let y = 0; y <= n; y++) {
            const by = bernstein(y / n);
            this._weights.push([]);
            this._points.push([]);
            for (let x = 0; x <= n; x++) {
                const bx = bernstein(x / n);
                const w = [];
                for (let j = 0; j < 4; j++) {
                    for (let i = 0; i < 4; i++)
                        w.push(bx[i] * by[j]);
                }
                this._weights[y].push(w);
                this._points[y].push([x / n * this._width, y / n * this._height]);
            }
        }

        this._model = new WobblyModel({
            friction: this._config.friction,
            springK: this._config.spring,
            mass: this._config.mass,
            width: this._width,
            height: this._height,
        });

        if (this.operation === 'unmaximize') {
            this._model.unmaximize();
            this._ended = true;
        } else if (this.operation === 'maximize') {
            this._model.maximize();
            this._ended = true;
        } else {
            const [pointerX, pointerY] = global.get_pointer();
            this._model.grab(pointerX - this._x, pointerY - this._y);
            actor.connectObject('notify::allocation', () => this._onMoved(actor), this);
        }

        Main.overview.connectObject('showing', () => this.finish(), this);

        this._timeline = new Clutter.Timeline({actor, duration: TIMELINE_DURATION});
        this._timeline.connectObject(
            'new-frame', (_t, msec) => this._onFrame(msec),
            'completed', () => this.finish(),
            this);
        this._timeline.start();
    }

    vfunc_modify_paint_volume() {
        return false;
    }

    // The grab ended; the effect runs until the springs settle.
    release() {
        this._ended = true;
    }

    finish() {
        Main.overview.disconnectObject(this);
        if (this._timeline) {
            this._timeline.stop();
            this._timeline.disconnectObject(this);
            this._timeline = null;
        }
        this._model = null;

        const actor = this.get_actor();
        if (actor) {
            actor.disconnectObject(this);
            actor.remove_effect(this);
        }
    }

    _onMoved(actor) {
        const [newX, newY] = actor.get_position();
        const dx = newX - this._x;
        const dy = newY - this._y;
        this._x = newX;
        this._y = newY;
        this._deltaX -= dx;
        this._deltaY -= dy;
        this._model?.move(dx, dy);
    }

    _onFrame(msec) {
        if (this._ended && (!this._timeline || !this._model?.movement)) {
            this.finish();
            return;
        }

        this._model.step((msec - this._lastMsec) / this._config.speedup);
        this._lastMsec = msec;

        const objects = this._model.objects;
        const n = this._tiles;
        for (let y = 0; y <= n; y++) {
            for (let x = 0; x <= n; x++) {
                const w = this._weights[y][x];
                let px = 0;
                let py = 0;
                for (let k = 0; k < 16; k++) {
                    px += w[k] * objects[k].x;
                    py += w[k] * objects[k].y;
                }
                this._points[y][x][0] = px;
                this._points[y][x][1] = py;
            }
        }

        const actor = this.get_actor();
        if (!actor)
            return;
        const [actorX, actorY] = actor.get_position();
        if (this.operation !== 'move' || (actorX === this._x && actorY === this._y))
            this.invalidate();
    }

    vfunc_deform_vertex(width, height, vertex) {
        if (!this._points)
            return;
        const n = this._tiles + 0.1;
        const [px, py] = this._points[(vertex.ty * n) >> 0][(vertex.tx * n) >> 0];
        vertex.x = (px + this._deltaX) * width / this._width;
        vertex.y = (py + this._deltaY) * height / this._height;
    }
});
