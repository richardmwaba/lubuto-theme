// SPDX-License-Identifier: GPL-3.0-or-later
//
// Directories a shell theme may live in, in lookup order. Matches the search
// order of the stock user-theme extension so an existing install is found.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export function getThemeDirs() {
    return [
        GLib.build_filenamev([GLib.get_home_dir(), '.themes']),
        GLib.build_filenamev([GLib.get_user_data_dir(), 'themes']),
        ...GLib.get_system_data_dirs().map(dir => GLib.build_filenamev([dir, 'themes'])),
    ];
}

export function findThemeStylesheet(themeName) {
    const paths = getThemeDirs().map(dir => `${dir}/${themeName}/gnome-shell/gnome-shell.css`);
    return paths.find(path => Gio.File.new_for_path(path).query_exists(null)) ?? null;
}
