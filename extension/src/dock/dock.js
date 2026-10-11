// SPDX-License-Identifier: GPL-3.0-or-later
//
// The dock: a Dash in a glass pill at the bottom edge of one monitor. It is
// shell chrome, so it can reserve space like the panel, hides with fullscreen
// windows, and steps aside while the overview shows its own dash.

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Backdrop} from '../blur/backdrop.js';
import {LubutoDash} from './dash.js';

const FADE_TIME = 150;

export class Dock {
    constructor(getConfig, getBlurParams) {
        this._getConfig = getConfig;
        this._getBlurParams = getBlurParams;
        this._container = null;
        this._dash = null;
        this._backdrop = null;
        this._monitor = null;
        this._reserveSpace = null;
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

        this._reserveSpace = this._getConfig().reserveSpace;
        Main.layoutManager.addChrome(this._container, {
            affectsStruts: this._reserveSpace,
            trackFullscreen: true,
        });

        Main.layoutManager.connectObject('monitors-changed', () => this._relayout(), this);
        Main.overview.connectObject(
            'showing', () => this._fade(false),
            'hidden', () => this._fade(true),
            this);
        this._dash.connectObject(
            'notify::allocation', () => this._place(),
            'icon-size-changed', () => this._place(),
            this);
        this._dash._background.connectObject('notify::allocation', () => this._placeBackdrop(), this);

        this._relayout();
    }

    disable() {
        Main.layoutManager.disconnectObject(this);
        Main.overview.disconnectObject(this);
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
        if (config.reserveSpace !== this._reserveSpace) {
            this._reserveSpace = config.reserveSpace;
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

    _fade(visible) {
        this._container.ease({
            opacity: visible ? 255 : 0,
            duration: FADE_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._container.reactive = visible;
            },
        });
    }

    _onShowApps() {
        if (this._dash.showAppsButton.checked)
            Main.overview.showApps();
        else
            Main.overview.hide();
    }
}
