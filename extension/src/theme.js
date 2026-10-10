// SPDX-License-Identifier: GPL-3.0-or-later
//
// Theme module: loads the shell stylesheet for the selected variant and follows
// the GNOME colour scheme.

import Gio from 'gi://Gio';

import {ExtensionState} from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {findThemeStylesheet} from './themeDirs.js';

const INTERFACE_SCHEMA = 'org.gnome.desktop.interface';
const USER_THEME_UUID = 'user-theme@gnome-shell-extensions.gcampax.github.com';

const COLOR_SUFFIX = {
    blue: '',
    purple: '-Purple',
    pink: '-Pink',
    red: '-Red',
    orange: '-Orange',
    yellow: '-Yellow',
    green: '-Green',
    teal: '-Teal',
    grey: '-Grey',
};

export class ThemeModule {
    constructor(settings) {
        this._settings = settings;
        this._interfaceSettings = null;
    }

    enable() {
        this._interfaceSettings = new Gio.Settings({schema_id: INTERFACE_SCHEMA});
        this._retireUserTheme();

        this._settings.connectObject(
            'changed::theme-name', () => this._apply(),
            'changed::color', () => this._apply(),
            'changed::color-scheme', () => this._apply(),
            'changed::light-style', () => this._apply(),
            'changed::compact', () => this._apply(),
            'changed::sync-gtk-theme', () => this._apply(),
            this);
        this._interfaceSettings.connectObject(
            'changed::color-scheme', () => this._apply(),
            this);

        this._apply();
    }

    disable() {
        this._settings.disconnectObject(this);
        this._interfaceSettings?.disconnectObject(this);
        this._interfaceSettings = null;

        Main.setThemeStylesheet(null);
        Main.loadTheme();
    }

    // user-theme and this module both set the shell stylesheet. Only one can own it.
    _retireUserTheme() {
        const manager = Main.extensionManager;
        const userTheme = manager.lookup(USER_THEME_UUID);
        if (userTheme?.state === ExtensionState.ACTIVE) {
            console.log('Lubuto: disabling user-theme, Lubuto loads the shell theme now');
            manager.disableExtension(USER_THEME_UUID);
        }
    }

    // The variant directory name, e.g. Lubuto-Teal-Dark-Compact.
    variantName() {
        const base = this._settings.get_string('theme-name');
        const color = COLOR_SUFFIX[this._settings.get_string('color')] ?? '';
        const compact = this._settings.get_boolean('compact') ? '-Compact' : '';
        return `${base}${color}${this._schemeSuffix()}${compact}`;
    }

    _schemeSuffix() {
        let scheme = this._settings.get_string('color-scheme');
        if (scheme === 'auto') {
            const system = this._interfaceSettings.get_string('color-scheme');
            scheme = system === 'prefer-dark' ? 'dark' : 'light';
        }

        if (scheme === 'dark')
            return '-Dark';

        return this._settings.get_string('light-style') === 'light' ? '-Light' : '';
    }

    _apply() {
        const name = this.variantName();
        const stylesheet = findThemeStylesheet(name);

        if (stylesheet)
            console.log(`Lubuto: loading shell theme ${stylesheet}`);
        else
            console.warn(`Lubuto: theme ${name} not found in any theme directory, using the default shell theme`);

        Main.setThemeStylesheet(stylesheet);
        Main.loadTheme();

        if (this._settings.get_boolean('sync-gtk-theme') && stylesheet &&
            this._interfaceSettings.get_string('gtk-theme') !== name)
            this._interfaceSettings.set_string('gtk-theme', name);
    }
}
