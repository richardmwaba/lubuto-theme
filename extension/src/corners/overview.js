// SPDX-License-Identifier: GPL-3.0-or-later
//
// Window previews in the overview and during workspace switches are clones of
// the window actor, which carry the rounded corners but not the shadow actor
// next to it. These patches add a clone of the shadow under each preview.
//
// Ported from Rounded Window Corners Reborn by flexagoon (GPL-3.0-or-later).

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';

import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {WindowPreview} from 'resource:///org/gnome/shell/ui/windowPreview.js';
import {WorkspaceAnimationController} from 'resource:///org/gnome/shell/ui/workspaceAnimation.js';

import {SHADOW_PADDING} from './shadow.js';

const OverviewShadowClone = GObject.registerClass({
    GTypeName: 'LubutoOverviewShadowClone',
}, class OverviewShadowClone extends Clutter.Clone {
    constructor(source, preview) {
        super({
            source,
            name: 'lubuto-overview-shadow',
            pivotPoint: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        this._preview = preview;
    }

    vfunc_allocate(box) {
        const preview = this._preview;
        const leaving = Main.overview._overview?.controls?._workspacesDisplay?._leavingOverview;
        const containerBox = leaving
            ? preview.windowContainer.get_allocation_box()
            : preview.get_allocation_box();
        const win = preview._windowActor?.get_meta_window();
        if (!win)
            return;

        const scale = containerBox.get_width() / win.get_frame_rect().width;
        const padding = SHADOW_PADDING * scale;
        box.set_origin(-padding, -padding);
        box.set_size(containerBox.get_width() + 2 * padding, containerBox.get_height() + 2 * padding);
        super.vfunc_allocate(box);
    }
});

export class PreviewShadows {
    constructor(corners) {
        this._corners = corners;
        this._injections = null;
    }

    enable() {
        this._injections = new InjectionManager();
        const corners = this._corners;

        this._injections.overrideMethod(WindowPreview.prototype, '_addWindow',
            original => function (window) {
                original.call(this, window);
                addOverviewShadow(corners, window, this);
            });

        this._injections.overrideMethod(WorkspaceAnimationController.prototype, '_prepareWorkspaceSwitch',
            original => function (workspaceIndices) {
                original.call(this, workspaceIndices);
                addSwitchShadows(corners, this);
            });

        this._injections.overrideMethod(WorkspaceAnimationController.prototype, '_finishWorkspaceSwitch',
            original => function (switchData) {
                removeSwitchShadows(this);
                original.call(this, switchData);
            });
    }

    disable() {
        this._injections?.clear();
        this._injections = null;
    }
}

function addOverviewShadow(corners, window, preview) {
    // Attached dialogs are added by the preview itself and get no shadow of their own.
    if (window.get_transient_for() !== null)
        return;

    const actor = window.get_compositor_private();
    if (!actor || !corners.isRounded(actor))
        return;
    const shadow = corners.shadowOf(actor);
    if (!shadow)
        return;

    const container = preview.windowContainer;
    const clone = new OverviewShadowClone(shadow, preview);
    container.bind_property('scale-x', clone, 'scale-x', GObject.BindingFlags.DEFAULT);
    container.bind_property('scale-y', clone, 'scale-y', GObject.BindingFlags.DEFAULT);
    preview.insert_child_below(clone, container);
}

function addSwitchShadows(corners, controller) {
    for (const monitor of controller._switchData.monitors) {
        for (const group of monitor._workspaceGroups) {
            const records = group._windowRecords;

            group.connectObject('destroy', () => global.display.disconnectObject(group), group);
            global.display.connectObject('restacked', () => {
                for (const {clone} of records) {
                    if (clone._lubutoShadow)
                        group.set_child_below_sibling(clone._lubutoShadow, clone);
                }
            }, group);

            for (const {windowActor: actor, clone} of records) {
                const win = actor.metaWindow;
                const shadow = corners.shadowOf(actor);
                if (!win || !shadow || !corners.isRounded(actor))
                    continue;

                const shadowClone = new Clutter.Clone({source: shadow});
                const frame = win.get_frame_rect();
                shadowClone.width = frame.width + SHADOW_PADDING * 2;
                shadowClone.height = frame.height + SHADOW_PADDING * 2;
                shadowClone.x = clone.x + frame.x - actor.x - SHADOW_PADDING;
                shadowClone.y = clone.y + frame.y - actor.y - SHADOW_PADDING;

                clone.connectObject('notify::translation-z', () => {
                    shadowClone.translationZ = clone.translationZ - 0.05;
                }, shadowClone);
                clone.bind_property('visible', shadowClone, 'visible', GObject.BindingFlags.DEFAULT);

                clone._lubutoShadow = shadowClone;
                group.insert_child_below(shadowClone, clone);
            }
        }
    }
}

function removeSwitchShadows(controller) {
    for (const monitor of controller._switchData.monitors) {
        for (const group of monitor._workspaceGroups) {
            for (const {clone} of group._windowRecords) {
                clone._lubutoShadow?.destroy();
                delete clone._lubutoShadow;
            }
        }
    }
}
