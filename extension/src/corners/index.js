// SPDX-License-Identifier: GPL-3.0-or-later
//
// Corners module: rounded corners and a soft shadow on every normal window,
// matched to the theme's window radius.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {WindowCorners} from './manager.js';
import {PreviewShadows} from './overview.js';

export class CornersModule {
    constructor(settings) {
        this._settings = settings;
        this._corners = null;
        this._previews = null;
    }

    enable() {
        this._settings.connectObject(
            'changed::corners-enabled', () => this._sync(),
            'changed::corners-radius', () => this._corners?.refreshAll(),
            'changed::corners-shadow', () => this._restart(),
            'changed::corners-keep-maximized', () => this._corners?.refreshAll(),
            'changed::corners-keep-fullscreen', () => this._corners?.refreshAll(),
            'changed::corners-blacklist', () => this._corners?.refreshAll(),
            this);

        if (Main.layoutManager._startingUp)
            Main.layoutManager.connectObject('startup-complete', () => this._sync(), this);
        else
            this._sync();
    }

    disable() {
        this._settings.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        this._stop();
    }

    _config() {
        return {
            radius: this._settings.get_int('corners-radius'),
            shadow: this._settings.get_boolean('corners-shadow'),
            keepMaximized: this._settings.get_boolean('corners-keep-maximized'),
            keepFullscreen: this._settings.get_boolean('corners-keep-fullscreen'),
            blacklist: this._settings.get_strv('corners-blacklist'),
        };
    }

    _sync() {
        if (this._settings.get_boolean('corners-enabled'))
            this._start();
        else
            this._stop();
    }

    _restart() {
        this._stop();
        this._sync();
    }

    _start() {
        if (this._corners)
            return;
        this._corners = new WindowCorners(() => this._config());
        this._corners.enable();
        this._previews = new PreviewShadows(this._corners);
        this._previews.enable();
    }

    _stop() {
        this._previews?.disable();
        this._previews = null;
        this._corners?.disable();
        this._corners = null;
    }
}
