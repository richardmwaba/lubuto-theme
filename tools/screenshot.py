#!/usr/bin/env python3
"""Takes a screenshot through the desktop portal and saves it to a path.

Usage: screenshot.py <out.png>

The portal asks once per app for permission; after that it answers without a
dialog. The shell's own org.gnome.Shell.Screenshot refuses unprivileged callers.
"""

import shutil
import sys
import urllib.parse

import gi

gi.require_version('Gio', '2.0')
from gi.repository import Gio, GLib


def main():
    out = sys.argv[1]
    loop = GLib.MainLoop()
    bus = Gio.bus_get_sync(Gio.BusType.SESSION)
    result = {}

    def on_response(connection, sender, path, iface, signal, params):
        code, data = params.unpack()
        result['code'] = code
        result['uri'] = data.get('uri')
        loop.quit()

    sender = bus.get_unique_name()[1:].replace('.', '_')
    token = 'lubuto1'
    handle = f'/org/freedesktop/portal/desktop/request/{sender}/{token}'
    bus.signal_subscribe('org.freedesktop.portal.Desktop', 'org.freedesktop.portal.Request', 'Response',
                         handle, None, Gio.DBusSignalFlags.NONE, on_response)
    bus.call_sync('org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop',
                  'org.freedesktop.portal.Screenshot', 'Screenshot',
                  GLib.Variant('(sa{sv})', ('', {'handle_token': GLib.Variant('s', token),
                                                 'interactive': GLib.Variant('b', True)})),
                  None, Gio.DBusCallFlags.NONE, 30000, None)
    GLib.timeout_add_seconds(60, loop.quit)
    loop.run()

    if result.get('code') != 0 or not result.get('uri'):
        sys.exit(f'screenshot refused or timed out: {result}')
    src = urllib.parse.unquote(result['uri'].removeprefix('file://'))
    shutil.move(src, out)
    print(out)


if __name__ == '__main__':
    main()
