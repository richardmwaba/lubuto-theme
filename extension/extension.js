// SPDX-License-Identifier: GPL-3.0-or-later
//
// Lubuto: one extension that loads the shell theme and, module by module,
// provides the visual behaviour the theme depends on. Modules enable in
// order and disable in reverse so each one can rely on the ones before it.

import Gio from 'gi://Gio';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {BlurModule} from './src/blur/index.js';
import {CornersModule} from './src/corners/index.js';
import {DockModule} from './src/dock/index.js';
import {MoveModule} from './src/move/index.js';
import {ShieldModule} from './src/shield.js';
import {WobbleModule} from './src/wobble/index.js';
import {ThemeModule} from './src/theme.js';

// The shell's own end-session dialog announces the outcome on the bus.
const END_SESSION_IFACE = 'org.gnome.SessionManager.EndSessionDialog';
const END_SESSION_PATH = '/org/gnome/SessionManager/EndSessionDialog';

export default class LubutoExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._theme = new ThemeModule(this._settings);
        this._theme.enable();
        this._effects = [];
        this._enableEffects();

        // Session teardown hangs mutter 50.5 for seconds inside its X11
        // shutdown, with the last frame left on screen. Clones, backdrops and
        // shadows painted over vanishing windows make that frame a mess, so
        // the effects go away the moment a logout, reboot or shutdown is
        // confirmed, and come back if an inhibitor gets it cancelled.
        this._endSessionId = Gio.DBus.session.signal_subscribe(
            null, END_SESSION_IFACE, null, END_SESSION_PATH, null,
            Gio.DBusSignalFlags.NONE,
            (connection, sender, path, iface, signal) => {
                if (signal.startsWith('Confirmed')) {
                    console.log(`Lubuto: ${signal}, dropping the effects`);
                    this._disableEffects();
                } else if (signal === 'Canceled') {
                    console.log('Lubuto: end of session cancelled, restoring the effects');
                    this._enableEffects();
                }
            });
    }

    disable() {
        if (this._endSessionId) {
            Gio.DBus.session.signal_unsubscribe(this._endSessionId);
            this._endSessionId = 0;
        }
        this._disableEffects();
        this._theme?.disable();
        this._theme = null;
        this._settings = null;
    }

    _enableEffects() {
        if (this._effects.length)
            return;
        this._effects = [
            new BlurModule(this._settings),
            new CornersModule(this._settings),
            new DockModule(this._settings),
            new MoveModule(this._settings),
            new WobbleModule(this._settings),
            new ShieldModule(),
        ];
        for (const module of this._effects)
            module.enable();
    }

    _disableEffects() {
        for (const module of [...this._effects].reverse())
            module.disable();
        this._effects = [];
    }
}
