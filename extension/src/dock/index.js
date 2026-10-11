// SPDX-License-Identifier: GPL-3.0-or-later
//
// Dock module: the macOS-style dock, see dock.js.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Dock} from './dock.js';

export class DockModule {
    constructor(settings) {
        this._settings = settings;
        this._dock = null;
    }

    enable() {
        this._settings.connectObject(
            'changed::dock-enabled', () => this._sync(),
            'changed::dock-icon-size', () => this._dock?.updateConfig(),
            'changed::dock-monitor', () => this._dock?.updateConfig(),
            'changed::dock-magnify', () => this._dock?.updateConfig(),
            'changed::dock-reserve-space', () => this._dock?.updateConfig(),
            'changed::dock-show-apps', () => this._dock?.updateConfig(),
            'changed::blur-enabled', () => this._restart(),
            'changed::blur-dock', () => this._restart(),
            'changed::blur-radius', () => this._dock?.updateBlur(),
            'changed::blur-brightness', () => this._dock?.updateBlur(),
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
            iconSize: this._settings.get_int('dock-icon-size'),
            monitor: this._settings.get_int('dock-monitor'),
            magnify: this._settings.get_boolean('dock-magnify'),
            magnifyScale: 1.2,
            reserveSpace: this._settings.get_boolean('dock-reserve-space'),
            showApps: this._settings.get_boolean('dock-show-apps'),
        };
    }

    _blurParams() {
        if (!this._settings.get_boolean('blur-enabled') || !this._settings.get_boolean('blur-dock'))
            return null;
        return {
            radius: this._settings.get_int('blur-radius'),
            brightness: this._settings.get_double('blur-brightness'),
        };
    }

    _sync() {
        if (this._settings.get_boolean('dock-enabled'))
            this._start();
        else
            this._stop();
    }

    _restart() {
        this._stop();
        this._sync();
    }

    _start() {
        if (this._dock)
            return;
        this._dock = new Dock(() => this._config(), () => this._blurParams());
        this._dock.enable();
    }

    _stop() {
        this._dock?.disable();
        this._dock = null;
    }
}
