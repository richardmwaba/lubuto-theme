// SPDX-License-Identifier: GPL-3.0-or-later
//
// Theme module: loads the shell stylesheet for the selected variant and follows
// the GNOME colour scheme.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {ExtensionState} from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {baseVariantName, findThemeDir, variantName} from './themeDirs.js';

const INTERFACE_SCHEMA = 'org.gnome.desktop.interface';
const USER_THEME_UUID = 'user-theme@gnome-shell-extensions.gcampax.github.com';

// The libadwaita links the installer's -l step writes in ~/.config/gtk-4.0.
const GTK4_LINKS = ['assets', 'gtk.css', 'gtk-dark.css'];

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
            'changed::theme-palette', () => this._apply(),
            'changed::theme-shade', () => this._apply(),
            'changed::theme-tweaks', () => this._apply(),
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

    // The variant directory name, e.g. Lubuto-Teal-Dark-Compact-Graphite-Submenu.
    variantName() {
        return variantName(this._settings, this._interfaceSettings);
    }

    // The installed directory for the settings: the full variant when the
    // installer built that combination, else the plain variant without colour
    // tweaks, so a tweak that has no build shows as "off" rather than as the
    // stock shell theme.
    _resolve() {
        const name = this.variantName();
        let dir = findThemeDir(name);
        if (dir)
            return {name, dir};

        const base = baseVariantName(this._settings, this._interfaceSettings);
        if (base !== name) {
            console.warn(`Lubuto: theme ${name} is not installed, run install.sh --matrix; using ${base}`);
            dir = findThemeDir(base);
            if (dir)
                return {name: base, dir};
        }

        console.warn(`Lubuto: theme ${base} not found in any theme directory, using the default shell theme`);
        return {name: null, dir: null};
    }

    _apply() {
        const {name, dir} = this._resolve();
        const stylesheet = dir ? `${dir}/gnome-shell/gnome-shell.css` : null;

        if (stylesheet)
            console.log(`Lubuto: loading shell theme ${stylesheet}`);

        Main.setThemeStylesheet(stylesheet);
        Main.loadTheme();

        if (!this._settings.get_boolean('sync-gtk-theme') || !name)
            return;

        if (this._interfaceSettings.get_string('gtk-theme') !== name)
            this._interfaceSettings.set_string('gtk-theme', name);
        this._relinkGtk4(dir);
    }

    // GTK 4 apps read the theme through links in ~/.config/gtk-4.0 rather than
    // through gtk-theme. The links move with the variant only when the
    // installer's -l step created them, so a user who never linked libadwaita
    // never gets links. Running apps keep their stylesheet until restarted.
    _relinkGtk4(dir) {
        const configDir = GLib.build_filenamev([GLib.get_user_config_dir(), 'gtk-4.0']);
        for (const entry of GTK4_LINKS) {
            const link = Gio.File.new_for_path(GLib.build_filenamev([configDir, entry]));
            const target = `${dir}/gtk-4.0/${entry}`;
            let info;
            try {
                info = link.query_info('standard::is-symlink,standard::symlink-target',
                    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
            } catch {
                continue;
            }
            if (!info.get_is_symlink() || info.get_symlink_target() === target)
                continue;
            if (!info.get_symlink_target().includes('/gtk-4.0/'))
                continue;
            try {
                link.delete(null);
                link.make_symbolic_link(target, null);
            } catch (e) {
                console.warn(`Lubuto: cannot re-point ${link.get_path()}: ${e.message}`);
            }
        }
    }
}
