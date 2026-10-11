// SPDX-License-Identifier: GPL-3.0-or-later
//
// Blurred wallpaper behind the overview, one backdrop per monitor, placed at
// the bottom of the overview group so it shows only while the overview does.

import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Backdrop} from './backdrop.js';

export class OverviewBlur {
    constructor(getParams) {
        this._getParams = getParams;
        this._group = null;
        this._backdrops = [];
    }

    enable() {
        this._group = new Meta.BackgroundGroup({name: 'lubuto-overview-glass'});
        Main.layoutManager.overviewGroup.insert_child_at_index(this._group, 0);
        Main.layoutManager.connectObject('monitors-changed', () => this._rebuild(), this);
        Main.layoutManager.overviewGroup.add_style_class_name('lubuto-glass');
        this._rebuild();
    }

    disable() {
        Main.layoutManager.overviewGroup.remove_style_class_name('lubuto-glass');
        Main.layoutManager.disconnectObject(this);
        this._clear();
        this._group?.destroy();
        this._group = null;
    }

    updateParams() {
        const params = this._getParams();
        for (const backdrop of this._backdrops)
            backdrop.setBlur(params);
    }

    _clear() {
        for (const backdrop of this._backdrops)
            backdrop.destroy();
        this._backdrops = [];
    }

    _rebuild() {
        this._clear();
        const params = this._getParams();
        for (const monitor of Main.layoutManager.monitors) {
            const backdrop = new Backdrop(monitor.index, params);
            backdrop.attach(this._group);
            backdrop.frame(0, 0, monitor.width, monitor.height, 0, monitor.x, monitor.y);
            this._backdrops.push(backdrop);
        }
    }
}
