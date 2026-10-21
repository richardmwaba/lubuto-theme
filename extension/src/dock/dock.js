// SPDX-License-Identifier: GPL-3.0-or-later
//
// The dock: a Dash in a glass pill at the bottom edge of one monitor. It is
// shell chrome, so it can reserve space like the panel, hides with fullscreen
// windows, and steps aside while the overview shows its own dash.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Backdrop} from '../blur/backdrop.js';
import {applyTint, clearTint} from '../blur/tint.js';
import {LubutoDash} from './dash.js';

// The overview's own dash is hidden while the dock runs, but keeps a height so
// the overview layout still leaves room at the bottom for the dock.
//
// The dock also tells every window where its icon is. The shell animates a
// minimise and a restore between the window and its icon geometry, and with
// none set it uses the monitor corner; nothing in the stock shell sets it.

const SLIDE_TIME = 200;
const HIDE_DELAY = 400;
// After a push reveals the dock, the pointer may be anywhere along the edge
// and needs time to reach the pill.
const REVEAL_GRACE = 1200;
const PRESSURE_THRESHOLD = 100;
const PRESSURE_TIMEOUT = 1000;

export class Dock {
    constructor(getConfig, getBlurParams) {
        this._getConfig = getConfig;
        this._getBlurParams = getBlurParams;
        this._container = null;
        this._dash = null;
        this._backdrop = null;
        this._monitor = null;
        this._reserveSpace = null;
        this._autohide = false;
        this._shown = true;
        this._hideTimeout = 0;
        this._pressureBarrier = null;
        this._barrier = null;
        this._iconGeometryLater = 0;
        this._placeLater = 0;
    }

    enable() {
        this._container = new St.Widget({
            name: 'lubuto-dock',
            style_class: 'lubuto-dock',
            layout_manager: new Clutter.BinLayout(),
            reactive: true,
            track_hover: true,
        });

        this._dash = new LubutoDash(() => this._getConfig());
        this._dash.showAppsButton.connectObject('notify::checked', () => this._onShowApps(), this);
        this._container.add_child(this._dash);

        this._autohide = this._getConfig().autohide;
        this._reserveSpace = this._getConfig().reserveSpace && !this._autohide;
        Main.layoutManager.addChrome(this._container, {
            affectsStruts: this._reserveSpace,
            trackFullscreen: true,
        });

        Main.layoutManager.connectObject('monitors-changed', () => this._relayout(), this);
        Main.overview.connectObject(
            'showing', () => this._onOverviewShowing(),
            'hidden', () => this._scheduleHide(),
            this);
        this._container.connectObject('notify::hover', () => this._onHoverChanged(), this);
        this._hideOverviewDash();
        // The container takes its natural size, so it follows icons that
        // appear, leave or animate; its allocation is the signal to recentre.
        this._container.connectObject('notify::allocation', () => this._place(), this);
        this._dash.connectObject('icon-size-changed', () => this._place(), this);
        // The frame takes its corner radius from the background's theme node.
        // At login that node resolves after the first allocation, so a style
        // change re-frames too, or the backdrop keeps square corners.
        this._dash._background.connectObject(
            'notify::allocation', () => this._placeBackdrop(),
            'style-changed', () => this._placeBackdrop(),
            this);
        // Icon geometry follows the icons (redisplay, size, position, which
        // all end in _place) and the windows. A new window of a running app
        // changes no icon, so its actor's arrival in the window group is the
        // cue; 'window-created' is too early, the actor does not exist yet.
        // The tracker's cue covers an app id that resolves after the map.
        this._dash.connectObject('redisplayed', () => this._queueIconGeometry(), this);
        global.window_group.connectObject('child-added', () => this._queueIconGeometry(), this);
        Shell.WindowTracker.get_default().connectObject(
            'tracked-windows-changed', () => this._queueIconGeometry(), this);

        this._relayout();
    }

    disable() {
        this._cancelHide();
        this._destroyBarrier();
        this._clearIconGeometry();
        if (this._placeLater) {
            global.compositor.get_laters().remove(this._placeLater);
            this._placeLater = 0;
        }
        Main.layoutManager.disconnectObject(this);
        global.window_group.disconnectObject(this);
        Shell.WindowTracker.get_default().disconnectObject(this);
        Main.overview.disconnectObject(this);
        this._container?.disconnectObject(this);
        this._restoreOverviewDash();
        this._dash?.showAppsButton.disconnectObject(this);
        this._dash?.disconnectObject(this);
        this._dash?._background.disconnectObject(this);
        clearTint(this._dash?._background);

        this._backdrop?.destroy();
        this._backdrop = null;
        if (this._container) {
            this._settleContainer();
            Main.layoutManager.removeChrome(this._container);
            this._container.destroy();
        }
        this._container = null;
        this._dash = null;
    }

    updateConfig() {
        const config = this._getConfig();
        this._autohide = config.autohide;
        const reserve = config.reserveSpace && !this._autohide;
        if (reserve !== this._reserveSpace) {
            this._reserveSpace = reserve;
            this._settleContainer();
            Main.layoutManager.removeChrome(this._container);
            Main.layoutManager.addChrome(this._container, {
                affectsStruts: this._reserveSpace,
                trackFullscreen: true,
            });
        }
        this._dash._adjustIconSize();
        this._dash.showAppsButton.visible = config.showApps;
        this._dash._showAppsIcon.visible = config.showApps;
        if (!config.magnify)
            this._dash.resetMagnify();
        this._relayout();
        if (this._autohide)
            this._scheduleHide();
        else
            this._show();
    }

    updateBlur() {
        const params = this._getBlurParams();
        this._backdrop?.setBlur(params);
        this.updateTint();
    }

    updateTint() {
        const params = this._getBlurParams();
        if (params && this._dash)
            applyTint(this._dash._background, params.dockOpacity);
        else if (this._dash)
            clearTint(this._dash._background);
    }

    // A chrome actor is its own relayout root, and clutter keeps that pending
    // entry when the actor leaves the stage before the relayout runs: the next
    // frame allocates the detached actor and logs two St criticals and a
    // "Spurious clutter_actor_allocate" warning. Reading the allocation box
    // runs the pending relayout while the actor is still in the stage, which
    // drains the entry. A screen lock disables the extension right after the
    // session mode change has queued a relayout, which is the common case.
    _settleContainer() {
        if (this._container.get_stage() && !this._container.has_allocation())
            this._container.get_allocation_box();
    }

    _targetMonitor() {
        const index = this._getConfig().monitor;
        const monitors = Main.layoutManager.monitors;
        if (index >= 0 && index < monitors.length)
            return monitors[index];
        return Main.layoutManager.primaryMonitor;
    }

    _relayout() {
        const monitor = this._targetMonitor();
        if (!monitor)
            return;

        // The layout manager builds new monitor objects on every change, and
        // the same index comes back with another geometry when the set of
        // monitors changes: the laptop panel alone and the external display
        // alone are both index 0. The backdrop copies the monitor size when
        // built, so it is rebuilt whenever the frame moves.
        const previous = this._monitor;
        const moved = !previous ||
            previous.index !== monitor.index ||
            previous.x !== monitor.x || previous.y !== monitor.y ||
            previous.width !== monitor.width || previous.height !== monitor.height;
        this._monitor = monitor;
        if (moved) {
            this._backdrop?.destroy();
            this._backdrop = null;
            if (this._getBlurParams()) {
                this._backdrop = new Backdrop(monitor.index, this._getBlurParams());
                this._backdrop.attach(this._container, this._dash);
            }
        }

        this._dash.setMaxSize(monitor.width, monitor.height);
        this._dash._adjustIconSize();
        this._dash._queueRedisplay();
        this._place();
        this._setupBarrier();
        this.updateTint();
    }

    // Autohide. The dock slides below the screen edge and comes back when the
    // pointer pushes against that edge, hovers the dock, or the overview opens.
    // It stays while something holds a grab, such as an app menu or a drag.

    _setupBarrier() {
        this._destroyBarrier();
        if (!this._autohide || !this._monitor)
            return;

        const monitor = this._monitor;
        this._pressureBarrier = new Layout.PressureBarrier(
            PRESSURE_THRESHOLD, PRESSURE_TIMEOUT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW);
        // A push with the pointer beside the pill reveals a dock nothing
        // hovers, so the hide check runs; it keeps the dock while the pointer
        // stays inside its box and hides it otherwise.
        this._pressureBarrier.connect('trigger', () => {
            this._show();
            this._scheduleHide(REVEAL_GRACE);
        });

        this._barrier = new Meta.Barrier({
            backend: global.backend,
            x1: monitor.x,
            x2: monitor.x + monitor.width,
            y1: monitor.y + monitor.height,
            y2: monitor.y + monitor.height,
            directions: Meta.BarrierDirection.NEGATIVE_Y,
        });
        this._pressureBarrier.addBarrier(this._barrier);
    }

    _destroyBarrier() {
        if (this._barrier) {
            this._pressureBarrier?.removeBarrier(this._barrier);
            this._barrier.destroy();
            this._barrier = null;
        }
        this._pressureBarrier?.destroy();
        this._pressureBarrier = null;
    }

    _onOverviewShowing() {
        // The shell raises the overview group above other chrome; the dock
        // goes back on top so the app grid slides in behind it.
        const uiGroup = Main.layoutManager.uiGroup;
        if (uiGroup.contains(this._container) && uiGroup.contains(Main.layoutManager.overviewGroup))
            uiGroup.set_child_above_sibling(this._container, Main.layoutManager.overviewGroup);
        this._show();
    }

    _onHoverChanged() {
        // Entering the pill while it slides out brings it back.
        if (this._container.hover)
            this._show();
        else
            this._scheduleHide();
    }

    _show() {
        this._cancelHide();
        if (this._shown)
            return;
        this._shown = true;

        this._container.show();
        this._container.remove_all_transitions();
        this._container.ease({
            translation_y: 0,
            duration: SLIDE_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _hide() {
        this._cancelHide();
        if (!this._shown || !this._autohide)
            return;
        this._shown = false;

        // The pressure barrier stays triggered until the pointer moves off
        // the edge line. Sliding along the edge out of the pill hides the
        // dock with the pointer still on that line, and a push then does
        // nothing until the pointer leaves the edge and comes back. A fresh
        // barrier starts untriggered, so a push after a hide always works.
        this._setupBarrier();

        this._container.remove_all_transitions();
        this._container.ease({
            translation_y: this._container.height,
            duration: SLIDE_TIME,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => {
                if (!this._shown)
                    this._container.hide();
            },
        });
    }

    _scheduleHide(delay = HIDE_DELAY) {
        this._cancelHide();
        if (!this._autohide)
            return;
        this._hideTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._hideTimeout = 0;
            if (this._shouldStayShown())
                this._scheduleHide();
            else
                this._hide();
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelHide() {
        if (this._hideTimeout) {
            GLib.source_remove(this._hideTimeout);
            this._hideTimeout = 0;
        }
    }

    _shouldStayShown() {
        return this._container.hover ||
            this._pointerInDock() ||
            Main.overview.visible ||
            global.stage.get_grab_actor() !== null;
    }

    // Whether the pointer is over the dock's settled box, from the top of the
    // container down to the screen edge. Hover alone misses the pointer that
    // sits on the edge line before the dock has slid in under it.
    _pointerInDock() {
        if (!this._monitor || !this._container)
            return false;
        const [x, y] = global.get_pointer();
        const c = this._container;
        return x >= c.x && x < c.x + c.width &&
            y >= c.y && y < this._monitor.y + this._monitor.height;
    }

    // The container recentres on its own allocation. Moving it there queues
    // a relayout after the layout pass, which Clutter's stage-view update
    // warns about, so the move waits for a BEFORE_REDRAW later, which runs
    // ahead of the next layout pass. One frame late, invisible.
    _place() {
        if (this._placeLater || !this._container)
            return;
        this._placeLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._placeLater = 0;
            this._placeNow();
            return GLib.SOURCE_REMOVE;
        });
    }

    _placeNow() {
        const monitor = this._monitor;
        if (!monitor || !this._container || !this._container.get_stage())
            return;

        const [, natWidth] = this._container.get_preferred_width(-1);
        const [, natHeight] = this._container.get_preferred_height(natWidth);
        const width = Math.ceil(natWidth);
        const height = Math.ceil(natHeight);

        this._container.set_position(
            Math.round(monitor.x + (monitor.width - width) / 2),
            monitor.y + monitor.height - height);

        this._reserveOverviewSpace();
        this._placeBackdrop();
        this._queueIconGeometry();
    }

    // Icon geometry. One pass once the dock settles: an IDLE later waits
    // for the redraw and its layout, so item allocations are final. A
    // BEFORE_REDRAW later runs ahead of the layout pass, and an icon
    // animating in queues a relayout every frame, so it finds no allocation
    // at any frame and nothing asks again after the last one.

    _queueIconGeometry() {
        if (this._iconGeometryLater || !this._container)
            return;
        const laters = global.compositor.get_laters();
        this._iconGeometryLater = laters.add(Meta.LaterType.IDLE, () => {
            this._iconGeometryLater = 0;
            this._updateIconGeometry();
            return GLib.SOURCE_REMOVE;
        });
    }

    // The rectangle of a dash item in stage coordinates at the settled dock
    // position. The item's parent is unscaled, so the parent's transformed
    // position plus the item's allocation stays put while the item itself
    // animates in from scale 0; the container's translation is the autohide
    // slide, which a hidden dock must not pass on.
    _itemRect(item) {
        const parent = item.get_parent();
        if (!parent || !item.has_allocation() || item.animatingOut)
            return null;
        const box = item.get_allocation_box();
        const [parentX, parentY] = parent.get_transformed_position();
        const width = Math.round(box.x2 - box.x1);
        const height = Math.round(box.y2 - box.y1);
        if (width <= 0 || height <= 0)
            return null;
        return new Mtk.Rectangle({
            x: Math.round(parentX + box.x1 - this._container.translation_x),
            y: Math.round(parentY + box.y1 - this._container.translation_y),
            width,
            height,
        });
    }

    _updateIconGeometry() {
        if (!this._container || !this._dash)
            return;

        const rects = new Map();
        for (const item of this._dash._box.get_children()) {
            const app = item.child?.app;
            if (!app)
                continue;
            const rect = this._itemRect(item);
            if (rect)
                rects.set(app, rect);
        }

        // A window whose app has no icon lands on the show-apps button, or
        // on the pill when that button is hidden.
        let fallback = null;
        if (this._dash._showAppsIcon.visible)
            fallback = this._itemRect(this._dash._showAppsIcon);
        if (!fallback && this._container.has_allocation()) {
            const [x, y] = this._container.get_transformed_position();
            fallback = new Mtk.Rectangle({
                x: Math.round(x - this._container.translation_x),
                y: Math.round(y - this._container.translation_y),
                width: this._container.width,
                height: this._container.height,
            });
        }

        const tracker = Shell.WindowTracker.get_default();
        for (const actor of global.get_window_actors()) {
            const window = actor.meta_window;
            if (!window)
                continue;
            const app = tracker.get_window_app(window);
            const rect = (app && rects.get(app)) ?? fallback;
            if (rect)
                window.set_icon_geometry(rect);
        }
    }

    _clearIconGeometry() {
        if (this._iconGeometryLater) {
            global.compositor.get_laters().remove(this._iconGeometryLater);
            this._iconGeometryLater = 0;
        }
        for (const actor of global.get_window_actors())
            actor.meta_window?.set_icon_geometry(null);
    }

    _placeBackdrop() {
        if (!this._backdrop || !this._monitor)
            return;

        const background = this._dash._background;
        if (!background.has_allocation() || !this._container.has_allocation())
            return;

        // Transformed positions include the autohide slide's translation,
        // which is where the pill is right now, not where it settles. The
        // frame samples the desktop at the settled position; the origin is
        // relative to the container and slides with it.
        const [bgX, bgY] = background.get_transformed_position();
        const [bgWidth, bgHeight] = background.get_transformed_size();
        const [containerX, containerY] = this._container.get_transformed_position();
        const settledX = bgX - this._container.translation_x;
        const settledY = bgY - this._container.translation_y;
        const radius = background.get_theme_node().get_border_radius(St.Corner.TOPLEFT);

        this._backdrop.frame(
            settledX - this._monitor.x, settledY - this._monitor.y, bgWidth, bgHeight, radius,
            bgX - containerX, bgY - containerY);
    }

    _hideOverviewDash() {
        const dash = Main.overview.dash;
        dash.opacity = 0;
        dash.reactive = false;
        this._reserveOverviewSpace();
    }

    _restoreOverviewDash() {
        const dash = Main.overview.dash;
        dash.set_height(-1);
        dash.opacity = 255;
        dash.reactive = true;
    }

    _reserveOverviewSpace() {
        if (!this._container)
            return;
        const dash = Main.overview.dash;
        const height = this._container.height;
        if (height > 0 && dash.height !== height)
            dash.set_height(height);
    }

    _onShowApps() {
        if (this._dash.showAppsButton.checked)
            Main.overview.showApps();
        else
            Main.overview.hide();
    }
}
