// SPDX-License-Identifier: GPL-3.0-or-later
//
// Blur module: static wallpaper blur behind the panel, the overview and the
// panel popovers. Each target is its own switch.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {OverviewBlur} from './overview.js';
import {PanelBlur} from './panel.js';
import {PopupBlur} from './popups.js';

export class BlurModule {
    constructor(settings) {
        this._settings = settings;
        this._targets = {};
        this._enabled = false;
    }

    enable() {
        this._settings.connectObject(
            'changed::blur-enabled', () => this._sync(),
            'changed::blur-panel', () => this._sync(),
            'changed::blur-overview', () => this._sync(),
            'changed::blur-popups', () => this._sync(),
            'changed::blur-radius', () => this._updateParams(),
            'changed::blur-brightness', () => this._updateParams(),
            'changed::glass-popover-opacity', () => this._updateParams(),
            'changed::glass-panel-opacity', () => this._updateParams(),
            this);

        if (Main.layoutManager._startingUp) {
            Main.layoutManager.connectObject('startup-complete', () => this._sync(), this);
        } else {
            this._sync();
        }
    }

    disable() {
        this._settings.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        this._setTargets({panel: false, overview: false, popups: false});
    }

    _params() {
        return {
            radius: this._settings.get_int('blur-radius'),
            brightness: this._settings.get_double('blur-brightness'),
            popoverOpacity: this._settings.get_double('glass-popover-opacity'),
            panelOpacity: this._settings.get_double('glass-panel-opacity'),
        };
    }

    _sync() {
        const on = this._settings.get_boolean('blur-enabled');
        this._setTargets({
            panel: on && this._settings.get_boolean('blur-panel'),
            overview: on && this._settings.get_boolean('blur-overview'),
            popups: on && this._settings.get_boolean('blur-popups'),
        });
    }

    _setTargets(wanted) {
        const factories = {
            panel: () => new PanelBlur(() => this._params()),
            overview: () => new OverviewBlur(() => this._params()),
            popups: () => new PopupBlur(() => this._params()),
        };

        for (const [name, want] of Object.entries(wanted)) {
            const have = this._targets[name];
            if (want && !have) {
                const target = factories[name]();
                target.enable();
                this._targets[name] = target;
            } else if (!want && have) {
                have.disable();
                delete this._targets[name];
            }
        }
    }

    _updateParams() {
        for (const target of Object.values(this._targets)) {
            target.updateParams();
            target.updateTint?.();
        }
    }
}
