// SPDX-License-Identifier: GPL-3.0-or-later
//
// Window previews for a dock icon: a popup above the icon with one thumbnail
// per window of the app on the current workspace. A click on a thumbnail
// goes to that window. The popup is a PopupMenu, so it gets the glass
// backdrop from the popup blur like every other menu, and the icon's own
// menu manager handles the grab and the outside click.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// Thumbnail height as a share of its width.
const PREVIEW_ASPECT = 0.625;
// The popup closes once the pointer has been outside the dock and the popup
// for this long. The pointer wanders off a dock naturally, and the popup's
// grab would otherwise hold an autohide dock on screen until a click.
const LEAVE_DELAY = 600;
const LEAVE_POLL = 150;
const FALLBACK_ICON_SIZE = 64;

// The app's windows on the active workspace in a fixed order. app.get_windows()
// is most recent first, and activating a window moves it to the front, so a
// cycle over that order bounces between two windows; the stable sequence is
// the order the windows were created in and never moves.
export function appWindows(app) {
    const workspace = global.workspace_manager.get_active_workspace();
    return app.get_windows()
        .filter(w => !w.skip_taskbar && w.located_on_workspace(workspace))
        .sort((a, b) => a.get_stable_sequence() - b.get_stable_sequence());
}

// The window after (step 1) or before (step -1) the focused one, cyclic.
export function nextWindow(app, step) {
    const windows = appWindows(app);
    if (windows.length === 0)
        return null;
    const focused = windows.indexOf(global.display.focus_window);
    const index = focused < 0 ? 0 : (focused + step + windows.length) % windows.length;
    return windows[index];
}

const WindowPreviewItem = GObject.registerClass(
    class WindowPreviewItem extends PopupMenu.PopupBaseMenuItem {
        _init(window, width) {
            super._init({style_class: 'lubuto-window-preview'});
            this.window = window;
            this.set_orientation(Clutter.Orientation.VERTICAL);
            // The ornament is the leading check or dot space of a text item; a
            // vertical item has no use for it.
            this._ornamentIcon.hide();

            const height = Math.round(width * PREVIEW_ASPECT);
            const thumb = new St.Widget({
                style_class: 'lubuto-window-preview-thumb',
                width,
                height,
                clip_to_allocation: true,
                layout_manager: new Clutter.BinLayout(),
            });
            thumb.add_child(this._buildPreview(window, width, height));

            const close = new St.Button({
                style_class: 'lubuto-window-preview-close',
                child: new St.Icon({icon_name: 'window-close-symbolic', icon_size: 16}),
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.START,
                x_expand: true,
                y_expand: true,
            });
            close.connect('clicked', () => window.delete(global.get_current_time()));
            thumb.add_child(close);
            this.add_child(thumb);

            const title = new St.Label({
                style_class: 'lubuto-window-preview-title',
                text: window.get_title() ?? '',
                x_align: Clutter.ActorAlign.CENTER,
            });
            title.clutter_text.ellipsize = 3; // Pango.EllipsizeMode.END
            title.set_width(width);
            this.add_child(title);
            window.connectObject('notify::title', () => {
                title.text = window.get_title() ?? '';
            }, this);
            this.connect('destroy', () => window.disconnectObject(this));
        }

        // A clone of the window actor cropped to the frame, so client-side
        // shadows stay out, scaled to fit. A minimised X11 window has no texture
        // any more; its item shows the app icon instead.
        _buildPreview(window, width, height) {
            const actor = window.get_compositor_private();
            if (!actor || !actor.get_texture()) {
                const app = Shell.WindowTracker.get_default().get_window_app(window);
                const icon = app
                    ? app.create_icon_texture(FALLBACK_ICON_SIZE)
                    : new St.Icon({icon_name: 'application-x-executable', icon_size: FALLBACK_ICON_SIZE});
                icon.x_align = icon.y_align = Clutter.ActorAlign.CENTER;
                icon.x_expand = icon.y_expand = true;
                return icon;
            }

            const frame = window.get_frame_rect();
            const buffer = window.get_buffer_rect();
            const scale = Math.min(width / frame.width, height / frame.height, 1);
            const holder = new St.Widget({
                width: Math.round(frame.width * scale),
                height: Math.round(frame.height * scale),
                clip_to_allocation: true,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
                y_expand: true,
            });
            const clone = new Clutter.Clone({
                source: actor,
                x: Math.round((buffer.x - frame.x) * scale),
                y: Math.round((buffer.y - frame.y) * scale),
            });
            clone.set_scale(scale, scale);
            holder.add_child(clone);
            return holder;
        }
    });

export class WindowPreviewMenu extends PopupMenu.PopupMenu {
    constructor(icon, app, getConfig) {
        super(icon, 0.5, St.Side.BOTTOM);
        this._icon = icon;
        this._app = app;
        this._getConfig = getConfig;
        this.actor.add_style_class_name('lubuto-window-previews');
        this.box.set_orientation(Clutter.Orientation.HORIZONTAL);
        Main.uiGroup.add_child(this.actor);
        this.actor.hide();

        // Arrows walk the thumbnails; the stock menu walks a column.
        this.actor.connect('key-press-event', (actor, event) => {
            const symbol = event.get_key_symbol();
            let direction = null;
            if (symbol === Clutter.KEY_Left)
                direction = St.DirectionType.LEFT;
            else if (symbol === Clutter.KEY_Right)
                direction = St.DirectionType.RIGHT;
            if (direction === null)
                return Clutter.EVENT_PROPAGATE;
            this.box.navigate_focus(global.stage.get_key_focus(), direction, true);
            return Clutter.EVENT_STOP;
        });
    }

    // Build the items for the app's windows now. The list follows the app
    // while the popup is open: a window that closes drops out, and the popup
    // closes when fewer than two remain.
    popup() {
        this._populate();
        this._app.connectObject('windows-changed', () => {
            if (appWindows(this._app).length < 2)
                this.close(BoxPointer.PopupAnimation.FADE);
            else
                this._populate();
        }, this);
        this.connect('open-state-changed', (menu, open) => {
            if (!open)
                this._app.disconnectObject(this);
        });
        this.open(BoxPointer.PopupAnimation.FULL);
        this._watchPointer();
    }

    // Closes the popup after the pointer has stayed outside the dock and the
    // popup for LEAVE_DELAY. Both rectangles and the gap between them count
    // as inside, so crossing from the icon to a thumbnail is safe. Polling
    // rather than hover: hover cannot cover the gap, and a grab is in place.
    _watchPointer() {
        this._stopWatching();
        let leftAt = 0;
        this._pointerWatch = GLib.timeout_add(GLib.PRIORITY_DEFAULT, LEAVE_POLL, () => {
            if (!this.isOpen) {
                this._pointerWatch = 0;
                return GLib.SOURCE_REMOVE;
            }
            const [x, y] = global.get_pointer();
            if (this._pointerInside(x, y)) {
                leftAt = 0;
                return GLib.SOURCE_CONTINUE;
            }
            const now = GLib.get_monotonic_time() / 1000;
            if (!leftAt) {
                leftAt = now;
                return GLib.SOURCE_CONTINUE;
            }
            if (now - leftAt < LEAVE_DELAY)
                return GLib.SOURCE_CONTINUE;
            this._pointerWatch = 0;
            this.close(BoxPointer.PopupAnimation.FADE);
            return GLib.SOURCE_REMOVE;
        });
    }

    _stopWatching() {
        if (this._pointerWatch) {
            GLib.source_remove(this._pointerWatch);
            this._pointerWatch = 0;
        }
    }

    _pointerInside(x, y) {
        // The dock container is the icon's ancestor directly under uiGroup.
        let dock = this._icon;
        while (dock.get_parent() && dock.get_parent() !== Main.uiGroup)
            dock = dock.get_parent();
        const rects = [this.actor, dock].map(actor => {
            const [ax, ay] = actor.get_transformed_position();
            const [aw, ah] = actor.get_transformed_size();
            return [ax, ay, ax + aw, ay + ah];
        });
        const x1 = Math.min(rects[0][0], rects[1][0]);
        const y1 = Math.min(rects[0][1], rects[1][1]);
        const x2 = Math.max(rects[0][2], rects[1][2]);
        const y2 = Math.max(rects[0][3], rects[1][3]);
        return x >= x1 && x < x2 && y >= y1 && y < y2;
    }

    // A pressed item's click gesture notifies when its action goes away, and
    // the stock handler then touches the item. An item destroyed under a
    // press, which the close button does when the window goes before the
    // release, would run that handler on a disposed object, so the actions go
    // first, while the item is alive.
    _dropItems() {
        for (const item of this._getMenuItems()) {
            for (const action of item.get_actions()) {
                // Disabling cancels a gesture in progress now, on the live
                // item; dropping its handlers keeps the stage's end-of-sequence
                // notification from reaching the item afterwards.
                action.enabled = false;
                GObject.signal_handlers_destroy(action);
                item.remove_action(action);
            }
            item.destroy();
        }
    }

    destroy() {
        this._stopWatching();
        this._dropItems();
        super.destroy();
    }

    _populate() {
        this._dropItems();
        const width = this._getConfig().previewSize;
        for (const window of appWindows(this._app)) {
            const item = new WindowPreviewItem(window, width);
            item.connect('activate', () => Main.activateWindow(window));
            this.addMenuItem(item);
        }
    }
}
