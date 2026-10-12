#!/usr/bin/env python3
"""Builds a GDM theme resource from an installed Lubuto shell theme.

Usage: build-gdm-theme.py <theme>/gnome-shell <out.gresource> [<system.gresource>]

GDM runs its own shell session without user extensions or ~/.themes, so the
login screen only ever reads the stylesheet inside the system's
gnome-shell-theme.gresource. This takes that resource, replaces the dark and
light stylesheets with the theme's one, adds the theme's assets, compiles a
new resource with glib-compile-resources and loads it back to check it.
Installing the result over the system file is the installer's job.
"""

import os
import shutil
import subprocess
import sys
import tempfile

import gi

gi.require_version('Gio', '2.0')
from gi.repository import Gio

PREFIX = '/org/gnome/shell/theme/'
SYSTEM = '/usr/share/gnome-shell/gnome-shell-theme.gresource'


def extract(resource, into):
    """Writes every file of a loaded GResource under `into`, keeping paths."""
    def walk(path):
        for child in Gio.resources_enumerate_children(path, 0):
            full = path + child
            if child.endswith('/'):
                walk(full)
            else:
                data = Gio.resources_lookup_data(full, 0).get_data()
                target = os.path.join(into, full[len(PREFIX):])
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with open(target, 'wb') as out:
                    out.write(data)
    walk(PREFIX)


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    theme, out = sys.argv[1], sys.argv[2]
    system = sys.argv[3] if len(sys.argv) > 3 else SYSTEM
    stylesheet = os.path.join(theme, 'gnome-shell.css')
    if not os.path.isfile(stylesheet):
        sys.exit(f'{stylesheet} not found; install the theme first.')
    if not shutil.which('glib-compile-resources'):
        sys.exit('glib-compile-resources not found. On Fedora: sudo dnf install glib2-devel')

    with tempfile.TemporaryDirectory() as work:
        Gio.resources_register(Gio.Resource.load(system))
        extract(system, work)

        # GDM picks the dark or light sheet from its own colour scheme, so both
        # carry the chosen variant; high contrast stays stock for a11y.
        for name in ('gnome-shell-dark.css', 'gnome-shell-light.css'):
            shutil.copyfile(stylesheet, os.path.join(work, name))
        for entry in os.listdir(theme):
            source = os.path.join(theme, entry)
            if entry == 'gnome-shell.css':
                continue
            if os.path.isdir(source):
                shutil.copytree(source, os.path.join(work, entry), dirs_exist_ok=True)
            else:
                shutil.copyfile(source, os.path.join(work, entry))

        files = []
        for root, _, names in os.walk(work):
            for name in names:
                files.append(os.path.relpath(os.path.join(root, name), work))
        manifest = os.path.join(work, 'gnome-shell-theme.gresource.xml')
        with open(manifest, 'w') as xml:
            xml.write('<?xml version="1.0" encoding="UTF-8"?>\n<gresources>\n')
            xml.write(f'  <gresource prefix="{PREFIX[:-1]}">\n')
            for name in sorted(files):
                xml.write(f'    <file>{name}</file>\n')
            xml.write('  </gresource>\n</gresources>\n')

        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        subprocess.run(['glib-compile-resources', '--sourcedir', work, '--target', out, manifest], check=True)

    built = Gio.Resource.load(out)
    for name in ('gnome-shell-dark.css', 'gnome-shell-light.css', 'gnome-shell-high-contrast.css'):
        built.lookup_data(PREFIX + name, 0)
    print(out)


if __name__ == '__main__':
    main()
