// SPDX-License-Identifier: GPL-3.0-or-later
//
// Theme directory names and lookup. The shell and the preferences window both
// compose the variant name from the settings, so the rules live here.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

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

const PALETTE_SUFFIX = {
    default: '',
    nord: '-Nord',
    dracula: '-Dracula',
};

const SHADE_SUFFIX = {
    grey: '',
    graphite: '-Graphite',
    black: '-Black',
};

// The colour tweaks in the order the installer writes their suffixes.
export const TWEAKS = [
    ['primary', '-Primary'],
    ['solid', '-Solid'],
    ['submenu', '-Submenu'],
];

// Directories a shell theme may live in, in lookup order. Matches the search
// order of the stock user-theme extension so an existing install is found.
export function getThemeDirs() {
    return [
        GLib.build_filenamev([GLib.get_home_dir(), '.themes']),
        GLib.build_filenamev([GLib.get_user_data_dir(), 'themes']),
        ...GLib.get_system_data_dirs().map(dir => GLib.build_filenamev([dir, 'themes'])),
    ];
}

export function findThemeDir(themeName) {
    const paths = getThemeDirs().map(dir => `${dir}/${themeName}`);
    return paths.find(path => Gio.File.new_for_path(`${path}/gnome-shell/gnome-shell.css`).query_exists(null)) ?? null;
}

export function findThemeStylesheet(themeName) {
    const dir = findThemeDir(themeName);
    return dir ? `${dir}/gnome-shell/gnome-shell.css` : null;
}

// The scheme suffix: -Dark, -Light or none, resolving "auto" against the
// system colour scheme.
export function schemeSuffix(settings, interfaceSettings) {
    let scheme = settings.get_string('color-scheme');
    if (scheme === 'auto') {
        const system = interfaceSettings.get_string('color-scheme');
        scheme = system === 'prefer-dark' ? 'dark' : 'light';
    }

    if (scheme === 'dark')
        return '-Dark';

    return settings.get_string('light-style') === 'light' ? '-Light' : '';
}

// The variant without any colour tweak, e.g. Lubuto-Teal-Dark-Compact.
export function baseVariantName(settings, interfaceSettings) {
    const base = settings.get_string('theme-name');
    const color = COLOR_SUFFIX[settings.get_string('color')] ?? '';
    const compact = settings.get_boolean('compact') ? '-Compact' : '';
    return `${base}${color}${schemeSuffix(settings, interfaceSettings)}${compact}`;
}

// The tweak suffixes for the settings, with any of `overrides` replacing a
// setting: {palette, shade, tweaks}. The preferences window uses the
// overrides to ask whether a choice it is about to offer is installed.
export function tweakSuffix(settings, overrides = {}) {
    const palette = overrides.palette ?? settings.get_string('theme-palette');
    const shade = overrides.shade ?? settings.get_string('theme-shade');
    const tweaks = overrides.tweaks ?? settings.get_strv('theme-tweaks');

    let suffix = `${PALETTE_SUFFIX[palette] ?? ''}${SHADE_SUFFIX[shade] ?? ''}`;
    for (const [tweak, tweakSuffix] of TWEAKS) {
        if (tweaks.includes(tweak))
            suffix += tweakSuffix;
    }
    return suffix;
}

// The full variant directory name, e.g. Lubuto-Teal-Dark-Compact-Graphite-Submenu.
export function variantName(settings, interfaceSettings, overrides = {}) {
    return baseVariantName(settings, interfaceSettings) + tweakSuffix(settings, overrides);
}
