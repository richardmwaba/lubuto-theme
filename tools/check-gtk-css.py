#!/usr/bin/env python3
"""Parses a compiled GTK stylesheet with the real GTK CSS parser and reports every error.

Usage: check-gtk-css.py <3|4> <gtk.css> [<gtk.css>...]

GTK logs parse errors only as warnings at runtime, so a broken rule goes unnoticed until
an app happens to log it. Running the parser directly turns that into a build check.
"""
import sys

import gi

version = sys.argv[1]
gi.require_version("Gtk", "4.0" if version == "4" else "3.0")
from gi.repository import Gtk  # noqa: E402

if version == "3":
    Gtk.init([])
else:
    Gtk.init()

failed = False
for path in sys.argv[2:]:
    errors = []
    provider = Gtk.CssProvider()
    def on_error(_provider, section, error):
        try:
            where = section.to_string()
        except AttributeError:
            where = f"line {section.get_start_line() + 1}"
        errors.append(f"{where}: {error.message}")

    provider.connect("parsing-error", on_error)
    try:
        provider.load_from_path(path)
    except Exception as e:  # GTK 3 also raises on the first error
        errors.append(str(e))
    for e in errors:
        print(f"{path}: {e}")
    if errors:
        failed = True
    else:
        print(f"{path}: ok (GTK {version})")

sys.exit(1 if failed else 0)
