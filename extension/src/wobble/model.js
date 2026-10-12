// SPDX-License-Identifier: GPL-3.0-or-later
//
// Spring model for wobbly windows: a 4x4 grid of masses joined by springs.
// One mass is pinned to the pointer while dragging; the others follow.
//
// From Compiz's wobbly plugin by David Reveman and Scott Moreau, spring model
// by Kristian Hogsberg, as carried into Compiz Windows Effect for GNOME Shell
// by Mauro Pepe (GPL-3.0-or-later). Lubuto version: class fields, plain loops.

const GRID = 4;
const INTENSITY = 0.8;
const MAX_FRICTION = 10;

export class WobblyModel {
    constructor({friction, springK, mass, width, height}) {
        this.width = width;
        this.height = height;
        this.friction = friction;
        this.springK = springK * 0.5;
        this.mass = 100 - mass;
        this.movement = false;
        this.pinned = null;

        this.objects = [];
        for (let gy = 0; gy < GRID; gy++) {
            for (let gx = 0; gx < GRID; gx++) {
                this.objects.push({
                    x: gx * width / (GRID - 1),
                    y: gy * height / (GRID - 1),
                    forceX: 0, forceY: 0,
                    velocityX: 0, velocityY: 0,
                    immobile: false,
                });
            }
        }

        this.springs = [];
        const hpad = width / (GRID - 1);
        const vpad = height / (GRID - 1);
        for (let i = 0; i < this.objects.length; i++) {
            const gx = i % GRID;
            const gy = Math.floor(i / GRID);
            if (gx > 0)
                this.springs.push({a: this.objects[i - 1], b: this.objects[i], offsetX: hpad, offsetY: 0});
            if (gy > 0)
                this.springs.push({a: this.objects[i - GRID], b: this.objects[i], offsetX: 0, offsetY: vpad});
        }
    }

    nearest(x, y) {
        let best = null;
        let bestDistance = Infinity;
        for (const object of this.objects) {
            const distance = Math.abs(object.x - x) + Math.abs(object.y - y);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = object;
            }
        }
        return best;
    }

    grab(x, y) {
        this.pinned = this.nearest(x, y);
        this.pinned.immobile = true;
    }

    move(deltaX, deltaY) {
        if (!this.pinned)
            return;
        this.pinned.x += deltaX;
        this.pinned.y += deltaY;
    }

    _kick(anchors) {
        this.friction = Math.min(this.friction * 2, MAX_FRICTION);
        for (const spring of this.springs) {
            if (anchors.includes(spring.a)) {
                spring.b.velocityX -= spring.offsetX * INTENSITY;
                spring.b.velocityY -= spring.offsetY * INTENSITY;
            } else if (anchors.includes(spring.b)) {
                spring.a.velocityX -= spring.offsetX * INTENSITY;
                spring.a.velocityY -= spring.offsetY * INTENSITY;
            }
        }
        this.step(0);
    }

    maximize() {
        this.pinned = null;
        const corners = [
            this.nearest(0, 0), this.nearest(this.width, 0),
            this.nearest(0, this.height), this.nearest(this.width, this.height),
        ];
        for (const corner of corners)
            corner.immobile = true;
        this._kick(corners);
    }

    unmaximize() {
        this.pinned = this.nearest(this.width / 2, this.height / 2);
        this.pinned.immobile = true;
        this._kick([this.pinned]);
    }

    step(steps) {
        let moving = false;
        for (let j = steps; j >= 0; j--) {
            for (const spring of this.springs) {
                const fx = this.springK * (spring.b.x - spring.a.x - spring.offsetX);
                spring.a.forceX += fx;
                spring.b.forceX -= fx;
                const fy = this.springK * (spring.b.y - spring.a.y - spring.offsetY);
                spring.a.forceY += fy;
                spring.b.forceY -= fy;
            }
            for (const object of this.objects) {
                if (object.immobile)
                    continue;
                object.forceX -= this.friction * object.velocityX;
                object.forceY -= this.friction * object.velocityY;
                object.velocityX += object.forceX / this.mass;
                object.velocityY += object.forceY / this.mass;
                object.x += object.velocityX;
                object.y += object.velocityY;
                moving ||= Math.abs(object.forceX) > 1 || Math.abs(object.forceY) > 1;
                object.forceX = 0;
                object.forceY = 0;
            }
        }
        this.movement = moving;
    }
}
