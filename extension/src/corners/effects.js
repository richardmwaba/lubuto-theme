// SPDX-License-Identifier: GPL-3.0-or-later
//
// Shaders for rounded window corners.
//
// The corner coverage shader is from Rounded Window Corners Reborn by
// flexagoon (GPL-3.0-or-later), which took its maths from mutter's background
// shader. Lubuto version: inlined as snippet strings, border support dropped
// (the theme draws rims itself), uniform locations cached as before.

import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

const CORNER_DECLARATIONS = `
uniform vec4 bounds;
uniform float clipRadius;
uniform vec2 pixelStep;

float lubutoWinCircle(vec2 p, vec2 center, float radius) {
    vec2 delta = p - center;
    float distSquared = dot(delta, delta);
    float outerRadius = radius + 0.5;
    if (distSquared >= outerRadius * outerRadius)
        return 0.0;
    float innerRadius = radius - 0.5;
    if (distSquared <= innerRadius * innerRadius)
        return 1.0;
    return outerRadius - sqrt(distSquared);
}

float lubutoWinAlpha(vec2 p) {
    if (p.x < bounds.x || p.x > bounds.z || p.y < bounds.y || p.y > bounds.w)
        return 0.0;
    vec2 center;
    float centerLeft = bounds.x + clipRadius;
    float centerRight = bounds.z - clipRadius;
    if (p.x < centerLeft)
        center.x = centerLeft;
    else if (p.x > centerRight)
        center.x = centerRight;
    else
        return 1.0;
    float centerTop = bounds.y + clipRadius;
    float centerBottom = bounds.w - clipRadius;
    if (p.y < centerTop)
        center.y = centerTop;
    else if (p.y > centerBottom)
        center.y = centerBottom;
    else
        return 1.0;
    return lubutoWinCircle(p, center, clipRadius);
}
`;

const CORNER_CODE = `
vec2 p = cogl_tex_coord0_in.xy / pixelStep;
cogl_color_out *= lubutoWinAlpha(p);
`;

export const WindowCornersEffect = GObject.registerClass({
    GTypeName: 'LubutoWindowCornersEffect',
}, class WindowCornersEffect extends Shell.GLSLEffect {
    constructor() {
        super();
        this._bounds = this.get_uniform_location('bounds');
        this._clipRadius = this.get_uniform_location('clipRadius');
        this._pixelStep = this.get_uniform_location('pixelStep');
    }

    vfunc_build_pipeline() {
        this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, CORNER_DECLARATIONS, CORNER_CODE, false);
    }

    // bounds are the window contents in actor pixels; radius in physical pixels.
    update(bounds, radius) {
        const actor = this.actor;
        if (!actor)
            return;

        const width = Math.max(1, actor.get_width());
        const height = Math.max(1, actor.get_height());
        const maxRadius = Math.min(bounds.x2 - bounds.x1, bounds.y2 - bounds.y1) / 2;

        this.set_uniform_float(this._bounds, 4, [bounds.x1, bounds.y1, bounds.x2, bounds.y2]);
        this.set_uniform_float(this._clipRadius, 1, [Math.min(radius, maxRadius)]);
        this.set_uniform_float(this._pixelStep, 2, [1 / width, 1 / height]);
        this.queue_repaint();
    }
});

// Keeps a shadow actor's paint out of the window area, see
// https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/4474
const CLIP_SHADOW_CODE = `
vec4 color = cogl_color_out;
float gray = (color.r + color.g + color.b) / 3.0;
cogl_color_out *= (1.0 - smoothstep(0.4, 1.0, gray)) * color.a;
`;

export const ClipShadowEffect = GObject.registerClass({
    GTypeName: 'LubutoClipShadowEffect',
}, class ClipShadowEffect extends Shell.GLSLEffect {
    vfunc_build_pipeline() {
        this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, '', CLIP_SHADOW_CODE, false);
    }
});
