#!/usr/bin/env python3
"""Renders a sample window of common widgets to a PNG with the active theme.

Usage: render-gtk.py <3|4> <out.png> [--css <gtk.css>] [--light] [--scale <n>]

GTK 4 maps a real window for a moment, then snapshots its content; GTK 3
does the same through its own backing surface. `--css` loads a compiled stylesheet above the
installed theme, so a build can be checked before it is installed. `--scale`
rasterises the GTK 4 render tree at an integer scale factor.

Run it with a clean environment on Wayland:

    env -i PATH=/usr/bin:/bin HOME=$HOME XDG_RUNTIME_DIR=/run/user/$(id -u) \\
        WAYLAND_DISPLAY=wayland-0 tools/render-gtk.py 4 out.png
"""

import sys


def parse_args(argv):
    if len(argv) < 3 or argv[1] not in ('3', '4'):
        sys.exit(__doc__)
    opts = {'version': argv[1], 'out': argv[2], 'css': None, 'dark': True, 'scale': 1}
    rest = argv[3:]
    while rest:
        flag = rest.pop(0)
        if flag == '--css':
            opts['css'] = rest.pop(0)
        elif flag == '--light':
            opts['dark'] = False
        elif flag == '--scale':
            opts['scale'] = int(rest.pop(0))
        else:
            sys.exit(f'unknown flag {flag}\n{__doc__}')
    return opts


def render_gtk4(opts):
    import gi
    gi.require_version('Gtk', '4.0')
    gi.require_version('Adw', '1')
    from gi.repository import Adw, GLib, Gdk, Gio, Gsk, Gtk

    app = Adw.Application(application_id='io.github.richardmwaba.LubutoRender',
                          flags=Gio.ApplicationFlags.NON_UNIQUE)

    def build_sidebar():
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        header = Adw.HeaderBar(show_title=False)
        box.append(header)
        listbox = Gtk.ListBox(css_classes=['navigation-sidebar'])
        for i, name in enumerate(['Recent', 'Starred', 'Home', 'Documents', 'Downloads']):
            row = Gtk.ListBoxRow()
            row.set_child(Gtk.Label(label=name, xalign=0, margin_start=6, margin_top=4, margin_bottom=4))
            listbox.append(row)
            if i == 2:
                listbox.select_row(row)
        box.append(listbox)
        return box

    def build_content():
        view = Adw.ToolbarView()
        header = Adw.HeaderBar()
        header.set_title_widget(Adw.WindowTitle(title='Lubuto sample', subtitle='GTK 4'))
        header.pack_start(Gtk.Button(icon_name='go-previous-symbolic'))
        menu = Gio.Menu()
        menu.append('Preferences', 'app.prefs')
        menu.append('About', 'app.about')
        header.pack_end(Gtk.MenuButton(icon_name='open-menu-symbolic', menu_model=menu))
        header.pack_end(Gtk.ToggleButton(icon_name='edit-find-symbolic'))
        view.add_top_bar(header)

        page = Adw.PreferencesPage()

        group = Adw.PreferencesGroup(title='Rows', description='Boxed list with controls')
        row = Adw.ActionRow(title='Switch row', subtitle='Secondary text')
        switch = Gtk.Switch(valign=Gtk.Align.CENTER, active=True)
        row.add_suffix(switch)
        group.add(row)
        row = Adw.ActionRow(title='Navigation row', activatable=True)
        row.add_suffix(Gtk.Image(icon_name='go-next-symbolic'))
        group.add(row)
        entry_row = Adw.EntryRow(title='Entry row', text='Typed text')
        group.add(entry_row)
        combo = Adw.ComboRow(title='Combo row', model=Gtk.StringList.new(['One', 'Two', 'Three']))
        group.add(combo)
        page.add(group)

        group = Adw.PreferencesGroup(title='Buttons')
        buttons = Gtk.Box(spacing=12, margin_top=6, margin_bottom=6)
        buttons.append(Gtk.Button(label='Normal'))
        buttons.append(Gtk.Button(label='Suggested', css_classes=['suggested-action']))
        buttons.append(Gtk.Button(label='Destructive', css_classes=['destructive-action']))
        buttons.append(Gtk.Button(label='Flat', css_classes=['flat']))
        buttons.append(Gtk.Button(label='Pill', css_classes=['pill']))
        buttons.append(Gtk.ToggleButton(label='Toggled', active=True))
        group.add(buttons)
        linked = Gtk.Box(css_classes=['linked'], margin_bottom=6)
        for label in ['Left', 'Middle', 'Right']:
            linked.append(Gtk.ToggleButton(label=label, active=label == 'Middle'))
        group.add(linked)
        toggles = Adw.ToggleGroup()
        for label in ['Day', 'Week', 'Month']:
            toggle = Adw.Toggle(label=label)
            toggles.add(toggle)
        toggles.set_active(1)
        group.add(toggles)
        page.add(group)

        group = Adw.PreferencesGroup(title='Inputs')
        inputs = Gtk.Box(spacing=12, margin_top=6)
        entry = Gtk.Entry(text='Entry', hexpand=True)
        inputs.append(entry)
        inputs.append(Gtk.SpinButton.new_with_range(0, 100, 1))
        inputs.append(Gtk.DropDown.new_from_strings(['Dropdown', 'Other']))
        group.add(inputs)
        checks = Gtk.Box(spacing=12, margin_top=6)
        checks.append(Gtk.CheckButton(label='Checked', active=True))
        checks.append(Gtk.CheckButton(label='Unchecked'))
        radio = Gtk.CheckButton(label='Radio on', active=True)
        radio2 = Gtk.CheckButton(label='Radio off', group=radio)
        checks.append(radio)
        checks.append(radio2)
        group.add(checks)
        scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 100, 1)
        scale.set_value(40)
        scale.set_draw_value(False)
        scale.set_margin_top(6)
        group.add(scale)
        progress = Gtk.ProgressBar(fraction=0.6, margin_top=6)
        group.add(progress)
        page.add(group)

        view.set_content(page)
        return view

    def on_activate(app):
        if opts['css']:
            provider = Gtk.CssProvider()
            provider.load_from_path(opts['css'])
            Gtk.StyleContext.add_provider_for_display(
                Gdk.Display.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_USER + 1)
        Adw.StyleManager.get_default().set_color_scheme(
            Adw.ColorScheme.FORCE_DARK if opts['dark'] else Adw.ColorScheme.FORCE_LIGHT)

        window = Adw.ApplicationWindow(application=app, default_width=960, default_height=640)
        split = Adw.NavigationSplitView()
        split.set_sidebar(Adw.NavigationPage(title='Sidebar', child=build_sidebar()))
        split.set_content(Adw.NavigationPage(title='Content', child=build_content()))
        window.set_content(split)
        window.present()

        def snapshot():
            # The window itself, so its own background and decoration paint
            # under translucent panes.
            width, height = window.get_width(), window.get_height()
            paintable = Gtk.WidgetPaintable.new(window)
            snap = Gtk.Snapshot()
            paintable.snapshot(snap, width, height)
            node = snap.to_node()
            if opts['scale'] != 1:
                # Scale the render tree, not the display: the stylesheet then
                # rasterises at that scale, which is what a crispness check needs.
                scale = Gsk.Transform.new().scale(opts['scale'], opts['scale'])
                node = Gsk.TransformNode.new(node, scale)
            renderer = window.get_native().get_renderer()
            texture = renderer.render_texture(node, None)
            texture.save_to_png(opts['out'])
            print(f'{opts["out"]}: {texture.get_width()}x{texture.get_height()}')
            app.quit()
            return False

        GLib.timeout_add(700, snapshot)

    app.connect('activate', on_activate)
    app.run([])


def render_gtk3(opts):
    import gi
    gi.require_version('Gtk', '3.0')
    gi.require_version('Gdk', '3.0')
    from gi.repository import GLib, Gdk, Gtk

    settings = Gtk.Settings.get_default()
    settings.set_property('gtk-application-prefer-dark-theme', opts['dark'])
    if opts['css']:
        provider = Gtk.CssProvider()
        provider.load_from_path(opts['css'])
        Gtk.StyleContext.add_provider_for_screen(
            Gdk.Screen.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_USER + 1)

    # An offscreen window cannot draw a CSD titlebar, so this maps a real
    # window and reads its own backing surface, which Wayland allows.
    window = Gtk.Window()
    window.set_default_size(960, 560)
    header = Gtk.HeaderBar(title='Lubuto sample', subtitle='GTK 3', show_close_button=True)
    header.pack_start(Gtk.Button.new_from_icon_name('go-previous-symbolic', Gtk.IconSize.BUTTON))
    header.pack_end(Gtk.MenuButton(image=Gtk.Image.new_from_icon_name('open-menu-symbolic', Gtk.IconSize.BUTTON)))
    window.set_titlebar(header)

    paned = Gtk.Paned()
    sidebar = Gtk.ListBox()
    sidebar.get_style_context().add_class('sidebar')
    for i, name in enumerate(['Recent', 'Starred', 'Home', 'Documents', 'Downloads']):
        row = Gtk.ListBoxRow()
        label = Gtk.Label(label=name, xalign=0)
        label.set_margin_start(12)
        label.set_margin_top(6)
        label.set_margin_bottom(6)
        row.add(label)
        sidebar.add(row)
        if i == 2:
            sidebar.select_row(row)
    sidebar.set_size_request(200, -1)
    paned.pack1(sidebar, False, False)

    content = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
    content.set_border_width(18)

    buttons = Gtk.Box(spacing=12)
    buttons.pack_start(Gtk.Button(label='Normal'), False, False, 0)
    suggested = Gtk.Button(label='Suggested')
    suggested.get_style_context().add_class('suggested-action')
    buttons.pack_start(suggested, False, False, 0)
    destructive = Gtk.Button(label='Destructive')
    destructive.get_style_context().add_class('destructive-action')
    buttons.pack_start(destructive, False, False, 0)
    flat = Gtk.Button(label='Flat')
    flat.get_style_context().add_class('flat')
    buttons.pack_start(flat, False, False, 0)
    buttons.pack_start(Gtk.ToggleButton(label='Toggled', active=True), False, False, 0)
    content.pack_start(buttons, False, False, 0)

    linked = Gtk.Box()
    linked.get_style_context().add_class('linked')
    for label in ['Left', 'Middle', 'Right']:
        linked.pack_start(Gtk.ToggleButton(label=label, active=label == 'Middle'), False, False, 0)
    content.pack_start(linked, False, False, 0)

    inputs = Gtk.Box(spacing=12)
    inputs.pack_start(Gtk.Entry(text='Entry'), True, True, 0)
    inputs.pack_start(Gtk.SpinButton.new_with_range(0, 100, 1), False, False, 0)
    combo = Gtk.ComboBoxText()
    combo.append_text('Combo')
    combo.append_text('Other')
    combo.set_active(0)
    inputs.pack_start(combo, False, False, 0)
    switch = Gtk.Switch(active=True, valign=Gtk.Align.CENTER)
    inputs.pack_start(switch, False, False, 0)
    content.pack_start(inputs, False, False, 0)

    checks = Gtk.Box(spacing=12)
    checks.pack_start(Gtk.CheckButton(label='Checked', active=True), False, False, 0)
    checks.pack_start(Gtk.CheckButton(label='Unchecked'), False, False, 0)
    radio = Gtk.RadioButton.new_with_label(None, 'Radio on')
    radio2 = Gtk.RadioButton.new_with_label_from_widget(radio, 'Radio off')
    checks.pack_start(radio, False, False, 0)
    checks.pack_start(radio2, False, False, 0)
    content.pack_start(checks, False, False, 0)

    scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 100, 1)
    scale.set_value(40)
    scale.set_draw_value(False)
    content.pack_start(scale, False, False, 0)
    content.pack_start(Gtk.ProgressBar(fraction=0.6), False, False, 0)

    frame = Gtk.Frame()
    listbox = Gtk.ListBox()
    for name in ['List row one', 'List row two', 'List row three']:
        row = Gtk.ListBoxRow()
        label = Gtk.Label(label=name, xalign=0)
        label.set_margin_start(12)
        label.set_margin_top(8)
        label.set_margin_bottom(8)
        row.add(label)
        listbox.add(row)
    frame.add(listbox)
    content.pack_start(frame, False, False, 0)

    notebook = Gtk.Notebook()
    for name in ['Tab one', 'Tab two']:
        notebook.append_page(Gtk.Label(label=name), Gtk.Label(label=name))
    content.pack_start(notebook, True, True, 0)

    paned.pack2(content, True, False)
    window.add(paned)
    window.show_all()

    def snapshot():
        gdk_window = window.get_window()
        pixbuf = Gdk.pixbuf_get_from_window(gdk_window, 0, 0, gdk_window.get_width(), gdk_window.get_height())
        pixbuf.savev(opts['out'], 'png', [], [])
        print(f'{opts["out"]}: {pixbuf.get_width()}x{pixbuf.get_height()}')
        Gtk.main_quit()
        return False

    GLib.timeout_add(500, snapshot)
    Gtk.main()


if __name__ == '__main__':
    options = parse_args(sys.argv)
    if options['version'] == '4':
        render_gtk4(options)
    else:
        render_gtk3(options)
