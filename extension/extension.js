// SPDX-License-Identifier: GPL-3.0-or-later
//
// Lubuto: one extension that loads the shell theme and, module by module,
// provides the visual behaviour the theme depends on. Modules enable in
// order and disable in reverse so each one can rely on the ones before it.

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {ThemeModule} from './src/theme.js';

export default class LubutoExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._modules = [
            new ThemeModule(this._settings),
        ];

        for (const module of this._modules)
            module.enable();
    }

    disable() {
        for (const module of [...this._modules].reverse())
            module.disable();

        this._modules = [];
        this._settings = null;
    }
}
