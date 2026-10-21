// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {TWEAKS, findThemeDir, variantName} from './src/themeDirs.js';

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

const PALETTES = [
    ['default', 'Default'],
    ['nord', 'Nord'],
    ['dracula', 'Dracula'],
];

const SHADES = [
    ['grey', 'Grey'],
    ['graphite', 'Graphite'],
    ['black', 'Black'],
];

const TWEAK_ROWS = {
    primary: ['Accent check boxes', 'Check boxes and radios in the accent colour instead of green'],
    solid: ['Solid panel and popovers', 'No transparency on the top panel and its menus'],
    submenu: ['Themed submenus', 'Submenus and quick settings menus in the surface colour'],
};

// The settings the variant name depends on.
const VARIANT_KEYS = ['theme-name', 'color', 'color-scheme', 'light-style', 'compact',
    'theme-palette', 'theme-shade', 'theme-tweaks'];

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

        this._addTweaks(page, settings);

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

        for (const [key, title] of [
            ['glass-popover-opacity', _('Popover tint')],
            ['glass-panel-opacity', _('Panel tint')],
            ['glass-dock-opacity', _('Dock tint')],
        ]) {
            const row = new Adw.SpinRow({
                title,
                subtitle: _('Lower is more transparent'),
                digits: 2,
                adjustment: new Gtk.Adjustment({lower: 0.2, upper: 1, step_increment: 0.02}),
            });
            settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            blur.add(row);
        }

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

        dock.add(this._comboRow(settings, 'dock-click-action', _('Click on a running app'), [
            ['previews', _('Previews when it has several windows')],
            ['cycle', _('Raise the next window')],
            ['minimize', _('Minimise its focused window, previews when it has several')],
        ], _('The wheel over an icon always steps through its windows')));

        const previewSize = new Adw.SpinRow({
            title: _('Preview width'),
            adjustment: new Gtk.Adjustment({lower: 120, upper: 480, step_increment: 20}),
        });
        settings.bind('dock-preview-size', previewSize, 'value', Gio.SettingsBindFlags.DEFAULT);
        dock.add(previewSize);

        const effects = new Adw.PreferencesGroup({title: _('Window effects')});
        page.add(effects);

        for (const [key, title] of [
            ['move-enabled', _('Translucent while dragging')],
            ['move-on-resize', _('Translucent while resizing')],
            ['wobble-enabled', _('Wobble while dragging')],
            ['wobble-maximize', _('Wobble on maximize and unmaximize')],
        ]) {
            const row = new Adw.SwitchRow({title});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            effects.add(row);
        }

        const moveOpacity = new Adw.SpinRow({
            title: _('Opacity while dragging'),
            adjustment: new Gtk.Adjustment({lower: 0, upper: 255, step_increment: 5}),
        });
        settings.bind('move-opacity', moveOpacity, 'value', Gio.SettingsBindFlags.DEFAULT);
        effects.add(moveOpacity);

        for (const [key, title, lower, upper, step] of [
            ['wobble-friction', _('Wobble friction'), 1, 10, 0.1],
            ['wobble-spring', _('Wobble spring'), 1, 10, 0.1],
            ['wobble-mass', _('Wobble mass'), 10, 99, 1],
        ]) {
            const row = new Adw.SpinRow({
                title,
                digits: 1,
                adjustment: new Gtk.Adjustment({lower, upper, step_increment: step}),
            });
            settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            effects.add(row);
        }
    }

    // The colour tweaks. Each choice names a theme directory, so a row says
    // when the directory it would select is not installed.
    _addTweaks(page, settings) {
        const interfaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        const group = new Adw.PreferencesGroup({
            title: _('Tweaks'),
            description: _('Each choice selects a theme directory; ./install.sh --matrix builds every combination. ' +
                'The shell follows at once, GTK apps after a restart.'),
        });
        page.add(group);

        const palette = this._comboRow(settings, 'theme-palette', _('Palette'), PALETTES);
        const shade = this._comboRow(settings, 'theme-shade', _('Surface shade'), SHADES);
        group.add(palette);
        group.add(shade);

        const switches = {};
        for (const [tweak] of TWEAKS) {
            const [title, subtitle] = TWEAK_ROWS[tweak];
            const row = new Adw.SwitchRow({title, subtitle});
            row.active = settings.get_strv('theme-tweaks').includes(tweak);
            row.connect('notify::active', () => {
                const tweaks = settings.get_strv('theme-tweaks').filter(t => t !== tweak);
                if (row.active)
                    tweaks.push(tweak);
                if (tweaks.length !== settings.get_strv('theme-tweaks').length)
                    settings.set_strv('theme-tweaks', tweaks);
            });
            group.add(row);
            switches[tweak] = row;
        }

        const installed = overrides => findThemeDir(variantName(settings, interfaceSettings, overrides)) !== null;
        const missing = (choices, key) => choices
            .filter(([nick]) => !installed({[key]: nick}))
            .map(([, label]) => label);

        const refresh = () => {
            const current = settings.get_strv('theme-tweaks');
            for (const [tweak] of TWEAKS) {
                const row = switches[tweak];
                const active = current.includes(tweak);
                if (row.active !== active)
                    row.active = active;
                const flipped = active ? current.filter(t => t !== tweak) : [...current, tweak];
                row.subtitle = installed({tweaks: flipped}) ? TWEAK_ROWS[tweak][1] : _('Not installed');
            }
            for (const [row, choices, key] of [[palette, PALETTES, 'palette'], [shade, SHADES, 'shade']]) {
                const gone = missing(choices, key);
                row.subtitle = gone.length ? `${_('Not installed:')} ${gone.join(', ')}` : '';
            }
        };

        for (const key of VARIANT_KEYS)
            settings.connect(`changed::${key}`, refresh);
        interfaceSettings.connect('changed::color-scheme', refresh);
        refresh();
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
