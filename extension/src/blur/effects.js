// SPDX-License-Identifier: GPL-3.0-or-later
//
// The two effects a glass backdrop needs: a static blur of the wallpaper and a
// rounded clip so the blurred region matches the rounded surface above it.
//
// The corner shader takes the coverage maths from mutter's background shader
// by way of Rounded Window Corners Reborn (GPL-3.0-or-later, flexagoon).

import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

// Shell.BlurEffect's radius is in physical pixels. Callers think in logical
// pixels, so the radius follows the UI scale.
export const StaticBlurEffect = GObject.registerClass({
    GTypeName: 'LubutoStaticBlurEffect',
}, class StaticBlurEffect extends Shell.BlurEffect {
    constructor(params = {}) {
        super({mode: Shell.BlurMode.ACTOR, ...params});
        this._unscaledRadius = 0;
        this._themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._themeContext.connectObject('notify::scale-factor',
            () => this._updateRadius(), this);
    }

    set unscaledRadius(value) {
        this._unscaledRadius = value;
        this._updateRadius();
    }

    get unscaledRadius() {
        return this._unscaledRadius;
    }

    _updateRadius() {
        this.radius = Math.max(0.5, this._unscaledRadius * this._themeContext.scale_factor);
    }

    vfunc_dispose() {
        this._themeContext?.disconnectObject(this);
        this._themeContext = null;
        super.vfunc_dispose();
    }
});

const CORNER_DECLARATIONS = `
uniform vec4 bounds;
uniform float clipRadius;
uniform vec2 pixelStep;

float lubutoCircleBounds(vec2 p, vec2 center, float radius) {
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

float lubutoCornerAlpha(vec2 p) {
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
    return lubutoCircleBounds(p, center, clipRadius);
}
`;

const CORNER_CODE = `
vec2 p = cogl_tex_coord0_in.xy / pixelStep;
cogl_color_out *= lubutoCornerAlpha(p);
`;

// Multiplies the painted texture by a rounded-rectangle coverage, so an actor
// painted through this effect gets rounded corners. The frame is the painted
// box in pixels: an actor with a clip paints only the clip, so pass the clip.
export const RoundedClipEffect = GObject.registerClass({
    GTypeName: 'LubutoRoundedClipEffect',
}, class RoundedClipEffect extends Shell.GLSLEffect {
    constructor() {
        super();
        this._bounds = this.get_uniform_location('bounds');
        this._clipRadius = this.get_uniform_location('clipRadius');
        this._pixelStep = this.get_uniform_location('pixelStep');
    }

    vfunc_build_pipeline() {
        this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, CORNER_DECLARATIONS, CORNER_CODE, false);
    }

    setFrame(width, height, radius) {
        const w = Math.max(1, width);
        const h = Math.max(1, height);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const r = Math.min(radius * scale, w / 2, h / 2);

        this.set_uniform_float(this._bounds, 4, [0, 0, w, h]);
        this.set_uniform_float(this._clipRadius, 1, [r]);
        this.set_uniform_float(this._pixelStep, 2, [1 / w, 1 / h]);
        this.queue_repaint();
    }
});
