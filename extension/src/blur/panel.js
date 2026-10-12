// SPDX-License-Identifier: GPL-3.0-or-later
//
// Glass behind the top panel. A zero-sized group goes first into the panel box
// so the box layout ignores it, and the backdrop inside it paints the blurred
// wallpaper under the panel. The panel's own background is the theme's tint.

import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Backdrop} from './backdrop.js';
import {applyTint, clearTint} from './tint.js';

export class PanelBlur {
    constructor(getParams) {
        this._getParams = getParams;
        this._group = null;
        this._backdrop = null;
    }

    enable() {
        this._group = new Meta.BackgroundGroup({name: 'lubuto-panel-glass', width: 0, height: 0});
        Main.layoutManager.panelBox.insert_child_at_index(this._group, 0);

        Main.layoutManager.connectObject('monitors-changed', () => this._rebuild(), this);
        Main.panel.connectObject('notify::allocation', () => this._update(), this);
        Main.layoutManager.panelBox.connectObject('notify::position', () => this._update(), this);
        Main.panel.add_style_class_name('lubuto-glass');

        this._rebuild();
        this.updateTint();
    }

    updateTint() {
        applyTint(Main.panel, this._getParams().panelOpacity);
    }

    disable() {
        clearTint(Main.panel);
        Main.panel.remove_style_class_name('lubuto-glass');
        Main.layoutManager.disconnectObject(this);
        Main.panel.disconnectObject(this);
        Main.layoutManager.panelBox.disconnectObject(this);

        this._backdrop?.destroy();
        this._backdrop = null;
        this._group?.destroy();
        this._group = null;
    }

    updateParams() {
        this._backdrop?.setBlur(this._getParams());
    }

    _rebuild() {
        this._backdrop?.destroy();
        this._backdrop = null;

        const monitor = Main.layoutManager.findMonitorForActor(Main.panel);
        if (!monitor)
            return;

        this._backdrop = new Backdrop(monitor.index, this._getParams());
        this._backdrop.attach(this._group);
        this._update();
    }

    _update() {
        if (!this._backdrop || !Main.panel.has_allocation() || !this._group.has_allocation())
            return;

        const monitor = this._backdrop.monitor;
        const [panelX, panelY] = Main.panel.get_transformed_position();
        const [groupX, groupY] = this._group.get_transformed_position();
        const radius = Main.panel.get_theme_node().get_border_radius(St.Corner.TOPLEFT);

        this._backdrop.frame(
            panelX - monitor.x, panelY - monitor.y,
            Main.panel.width, Main.panel.height,
            radius,
            panelX - groupX, panelY - groupY);
    }
}
