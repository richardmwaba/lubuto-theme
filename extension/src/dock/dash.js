// SPDX-License-Identifier: GPL-3.0-or-later
//
// The shell's Dash with three changes: the icon size is a setting rather than
// whatever fits, icons grow under the pointer, and an icon whose app has
// several windows shows them as previews on a click. DashItemContainer sizes
// itself from its child's scale, so a magnified icon pushes its neighbours
// apart the way the macOS dock does.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Shell from 'gi://Shell';

import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {WindowPreviewMenu, appWindows, nextWindow} from './previews.js';

// Milliseconds after a wheel step during which further scroll events are
// swallowed: a classic wheel notch arrives as two events.
const SCROLL_COOLDOWN = 150;

const MAGNIFY_TIME = 150;

// A dash icon that knows about its app's windows. The stock icon raises the
// most recent window on every click; a second window is out of reach without
// the switcher.
export const LubutoDashIcon = GObject.registerClass({
    GTypeName: 'LubutoDashIcon',
}, class LubutoDashIcon extends Dash.DashIcon {
    _init(app, getConfig) {
        super._init(app);
        this._getConfig = getConfig;
        this._previews = null;
        this.connect('destroy', () => {
            this._previews?.destroy();
            this._previews = null;
        });
    }

    // A plain left click on a running app with two or more windows opens
    // the previews or steps to the next window; everything else keeps the
    // stock behaviour: one window raises it, Ctrl and middle click open a new
    // window, a stopped app launches.
    // A plain left click on a running app: previews when it has several
    // windows, minimise when its one window has focus, raise it otherwise.
    // One behaviour rather than a setting: the three cases never compete,
    // and the wheel covers stepping through windows.
    activate(button) {
        const event = Clutter.get_current_event();
        const modifiers = event ? event.get_state() : 0;
        const plainLeft = (!button || button === Clutter.BUTTON_PRIMARY) &&
            (modifiers & Clutter.ModifierType.CONTROL_MASK) === 0;
        const windows = this.app.state === Shell.AppState.RUNNING ? appWindows(this.app) : [];

        if (plainLeft && windows.length === 1 && windows[0] === global.display.focus_window) {
            windows[0].minimize();
            return;
        }

        if (!plainLeft || windows.length < 2) {
            super.activate(button);
            return;
        }

        // A second click closes, like the app menu. Stepping windows from
        // here is not an option: the shell drops every grab when a window
        // takes focus, so the popup would close on the first step anyway.
        if (this._previews?.isOpen)
            this._previews.close(BoxPointer.PopupAnimation.FULL);
        else
            this._popupPreviews();
    }

    // The wheel over the icon walks the app's windows without a popup. A
    // classic wheel notch arrives as a smooth event and a discrete one, a
    // high-resolution wheel or a touchpad as smooth events alone, so smooth
    // deltas accumulate to a step and a short cooldown after any step swallows
    // the companion event.
    vfunc_scroll_event(event) {
        let step = 0;
        switch (event.get_scroll_direction()) {
            case Clutter.ScrollDirection.UP:
            case Clutter.ScrollDirection.LEFT:
                step = -1;
                break;
            case Clutter.ScrollDirection.DOWN:
            case Clutter.ScrollDirection.RIGHT:
                step = 1;
                break;
            case Clutter.ScrollDirection.SMOOTH: {
                const [dx, dy] = event.get_scroll_delta();
                this._scrollAccumulator = (this._scrollAccumulator ?? 0) +
                    (Math.abs(dy) >= Math.abs(dx) ? dy : dx);
                if (Math.abs(this._scrollAccumulator) >= 1)
                    step = Math.sign(this._scrollAccumulator);
                break;
            }
            default:
                return Clutter.EVENT_PROPAGATE;
        }

        const time = event.get_time();
        if (step === 0 || time - (this._lastScrollStep ?? 0) < SCROLL_COOLDOWN) {
            if (step !== 0)
                this._scrollAccumulator = 0;
            return Clutter.EVENT_STOP;
        }

        const window = nextWindow(this.app, step);
        if (!window)
            return Clutter.EVENT_PROPAGATE;
        this._lastScrollStep = time;
        this._scrollAccumulator = 0;
        Main.activateWindow(window);
        return Clutter.EVENT_STOP;
    }

    _popupPreviews() {
        if (!this._previews) {
            this._previews = new WindowPreviewMenu(this, this.app, this._getConfig);
            this._previews.connect('open-state-changed', (menu, open) => {
                // The dash hides the tooltip while a menu is up, the way it
                // does for the app menu.
                this.setForcedHighlight(open);
                this.emit('menu-state-changed', open);
            });
            Main.overview.connectObject('hiding', () => this._previews?.close(), this);
            this._menuManager.addMenu(this._previews);
        }
        this._previews.popup();
    }
});

export const LubutoDash = GObject.registerClass({
    GTypeName: 'LubutoDash',
    Signals: {'redisplayed': {}},
}, class LubutoDash extends Dash.Dash {
    _init(getConfig) {
        this._getConfig = getConfig;
        super._init();
        this._magnified = new Set();
    }

    // The dock maps windows to icons; it needs to know when the set of
    // icons changes, which the stock dash keeps to itself.
    _redisplay() {
        super._redisplay();
        this.emit('redisplayed');
    }

    // The stock factory with the Lubuto icon in place of the stock one.
    _createAppItem(app) {
        const item = new Dash.DashItemContainer();
        const appIcon = new LubutoDashIcon(app, this._getConfig);

        appIcon.connect('menu-state-changed', (o, opened) => {
            this._itemMenuStateChanged(item, opened);
        });

        item.setChild(appIcon);
        // The accessible name is the container's label text.
        appIcon.label_actor = null;
        item.setLabelText(app.get_name());

        appIcon.icon.setIconSize(this.iconSize);
        this._hookUpLabel(item, appIcon);

        return item;
    }

    // Every icon takes the configured size. The stock version picks the
    // largest of a fixed list that fits the given maximum.
    _adjustIconSize() {
        const size = this._getConfig().iconSize;
        const iconChildren = this._box.get_children().filter(actor =>
            actor.child?._delegate?.icon && !actor.animatingOut);
        iconChildren.push(this._showAppsIcon);

        for (const item of iconChildren) {
            const icon = item.child._delegate.icon;
            if (icon.iconSize !== size)
                icon.setIconSize(size);
            this._hookMagnify(item);
        }

        if (this.iconSize !== size) {
            this.iconSize = size;
            this.emit('icon-size-changed');
        }
    }

    _hookMagnify(item) {
        if (this._magnified.has(item))
            return;
        this._magnified.add(item);

        const child = item.child;
        child.pivot_point = new Graphene.Point({x: 0.5, y: 1});
        child.connectObject('notify::hover', () => {
            if (!this._getConfig().magnify)
                return;
            const scale = child.hover ? this._getConfig().magnifyScale : 1;
            child.ease({
                scale_x: scale,
                scale_y: scale,
                duration: MAGNIFY_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }, this);
        item.connectObject('destroy', () => this._magnified.delete(item), this);
    }

    resetMagnify() {
        for (const item of this._magnified) {
            if (item.child)
                item.child.set_scale(1, 1);
        }
    }
});
