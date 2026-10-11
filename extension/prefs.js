// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const COLORS = [
    ['blue', 'Blue'],
    ['purple', 'Purple'],
    ['pink', 'Pink'],
    ['red', 'Red'],
    ['orange', 'Orange'],
    ['yellow', 'Yellow'],
    ['green', 'Green'],
    ['teal', 'Teal'],
    ['grey', 'Grey'],
];

const SCHEMES = [
    ['auto', 'Follow system'],
    ['light', 'Light'],
    ['dark', 'Dark'],
];

const LIGHT_STYLES = [
    ['standard', 'Dark top bar'],
    ['light', 'Fully light'],
];

export default class LubutoPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({title: _('Theme'), icon_name: 'preferences-desktop-theme-symbolic'});
        window.add(page);

        const group = new Adw.PreferencesGroup({title: _('Variant')});
        page.add(group);

        group.add(this._comboRow(settings, 'color', _('Accent colour'), COLORS));
        group.add(this._comboRow(settings, 'color-scheme', _('Colour scheme'), SCHEMES));
        group.add(this._comboRow(settings, 'light-style', _('Light variant'), LIGHT_STYLES,
            _('Which variant to use when the scheme is light')));

        const compact = new Adw.SwitchRow({title: _('Compact size')});
        settings.bind('compact', compact, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(compact);

        const sync = new Adw.SwitchRow({
            title: _('Set the GTK theme to match'),
            subtitle: _('Keeps org.gnome.desktop.interface gtk-theme on the same variant'),
        });
        settings.bind('sync-gtk-theme', sync, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(sync);

        const blur = new Adw.PreferencesGroup({title: _('Glass blur')});
        page.add(blur);

        for (const [key, title] of [
            ['blur-enabled', _('Blur the wallpaper behind glass surfaces')],
            ['blur-panel', _('Top panel')],
            ['blur-overview', _('Overview')],
            ['blur-popups', _('Panel popovers')],
            ['blur-dock', _('Dock')],
        ]) {
            const row = new Adw.SwitchRow({title});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            blur.add(row);
        }

        const radius = new Adw.SpinRow({
            title: _('Blur radius'),
            adjustment: new Gtk.Adjustment({lower: 0, upper: 100, step_increment: 1}),
        });
        settings.bind('blur-radius', radius, 'value', Gio.SettingsBindFlags.DEFAULT);
        blur.add(radius);

        const brightness = new Adw.SpinRow({
            title: _('Brightness'),
            digits: 2,
            adjustment: new Gtk.Adjustment({lower: 0.1, upper: 1, step_increment: 0.05}),
        });
        settings.bind('blur-brightness', brightness, 'value', Gio.SettingsBindFlags.DEFAULT);
        blur.add(brightness);

        const corners = new Adw.PreferencesGroup({title: _('Window corners')});
        page.add(corners);

        for (const [key, title] of [
            ['corners-enabled', _('Round window corners')],
            ['corners-shadow', _('Shadow under rounded windows')],
            ['corners-keep-maximized', _('Keep corners when maximized')],
            ['corners-keep-fullscreen', _('Keep corners in fullscreen')],
        ]) {
            const row = new Adw.SwitchRow({title});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            corners.add(row);
        }

        const cornerRadius = new Adw.SpinRow({
            title: _('Corner radius'),
            adjustment: new Gtk.Adjustment({lower: 0, upper: 40, step_increment: 1}),
        });
        settings.bind('corners-radius', cornerRadius, 'value', Gio.SettingsBindFlags.DEFAULT);
        corners.add(cornerRadius);

        const dock = new Adw.PreferencesGroup({title: _('Dock')});
        page.add(dock);

        for (const [key, title] of [
            ['dock-enabled', _('Show the dock')],
            ['dock-magnify', _('Grow icons under the pointer')],
            ['dock-reserve-space', _('Keep windows from overlapping the dock')],
            ['dock-autohide', _('Hide until the pointer pushes the bottom edge')],
            ['dock-show-apps', _('Applications button')],
        ]) {
            const row = new Adw.SwitchRow({title});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            dock.add(row);
        }

        const dockIconSize = new Adw.SpinRow({
            title: _('Icon size'),
            adjustment: new Gtk.Adjustment({lower: 24, upper: 96, step_increment: 2}),
        });
        settings.bind('dock-icon-size', dockIconSize, 'value', Gio.SettingsBindFlags.DEFAULT);
        dock.add(dockIconSize);

        const dockMonitor = new Adw.SpinRow({
            title: _('Monitor'),
            subtitle: _('-1 for the primary monitor'),
            adjustment: new Gtk.Adjustment({lower: -1, upper: 8, step_increment: 1}),
        });
        settings.bind('dock-monitor', dockMonitor, 'value', Gio.SettingsBindFlags.DEFAULT);
        dock.add(dockMonitor);
    }

    _comboRow(settings, key, title, choices, subtitle = null) {
        const row = new Adw.ComboRow({
            title,
            subtitle,
            model: Gtk.StringList.new(choices.map(([, label]) => label)),
        });

        const nicks = choices.map(([nick]) => nick);
        row.selected = Math.max(0, nicks.indexOf(settings.get_string(key)));
        row.connect('notify::selected', () => settings.set_string(key, nicks[row.selected]));
        settings.connect(`changed::${key}`, () => {
            const index = nicks.indexOf(settings.get_string(key));
            if (index >= 0 && row.selected !== index)
                row.selected = index;
        });

        return row;
    }
}
