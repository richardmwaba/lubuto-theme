// SPDX-License-Identifier: GPL-3.0-or-later
//
// The dock: a Dash in a glass pill at the bottom edge of one monitor. It is
// shell chrome, so it can reserve space like the panel, hides with fullscreen
// windows, and steps aside while the overview shows its own dash.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Backdrop} from '../blur/backdrop.js';
import {LubutoDash} from './dash.js';

// The overview's own dash is hidden while the dock runs, but keeps a height so
// the overview layout still leaves room at the bottom for the dock.

const SLIDE_TIME = 200;
const HIDE_DELAY = 400;
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
        this._dash.connectObject(
            'notify::allocation', () => this._place(),
            'icon-size-changed', () => this._place(),
            this);
        this._dash._background.connectObject('notify::allocation', () => this._placeBackdrop(), this);

        this._relayout();
    }

    disable() {
        this._cancelHide();
        this._destroyBarrier();
        Main.layoutManager.disconnectObject(this);
        Main.overview.disconnectObject(this);
        this._container?.disconnectObject(this);
        this._restoreOverviewDash();
        this._dash?.showAppsButton.disconnectObject(this);
        this._dash?.disconnectObject(this);
        this._dash?._background.disconnectObject(this);

        this._backdrop?.destroy();
        this._backdrop = null;
        if (this._container) {
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
        this._backdrop?.setBlur(this._getBlurParams());
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

        if (this._monitor?.index !== monitor.index) {
            this._monitor = monitor;
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
        this._pressureBarrier.connect('trigger', () => this._show());

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
        if (this._container.hover)
            this._cancelHide();
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

    _scheduleHide() {
        this._cancelHide();
        if (!this._autohide)
            return;
        this._hideTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HIDE_DELAY, () => {
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
            Main.overview.visible ||
            global.stage.get_grab_actor() !== null;
    }

    _place() {
        const monitor = this._monitor;
        if (!monitor || !this._container)
            return;

        const [, natWidth] = this._dash.get_preferred_width(-1);
        const [, natHeight] = this._dash.get_preferred_height(natWidth);
        const width = Math.ceil(natWidth);
        const height = Math.ceil(natHeight);

        this._container.set_size(width, height);
        this._container.set_position(
            Math.round(monitor.x + (monitor.width - width) / 2),
            monitor.y + monitor.height - height);

        this._reserveOverviewSpace();
        this._placeBackdrop();
    }

    _placeBackdrop() {
        if (!this._backdrop || !this._monitor)
            return;

        const background = this._dash._background;
        if (!background.has_allocation() || !this._container.has_allocation())
            return;

        const [bgX, bgY] = background.get_transformed_position();
        const [bgWidth, bgHeight] = background.get_transformed_size();
        const [containerX, containerY] = this._container.get_transformed_position();
        const radius = background.get_theme_node().get_border_radius(St.Corner.TOPLEFT);

        this._backdrop.frame(
            bgX - this._monitor.x, bgY - this._monitor.y, bgWidth, bgHeight, radius,
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
