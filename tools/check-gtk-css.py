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
    provider.connect(
        "parsing-error",
        lambda _p, section, error: errors.append(f"{section.to_string()}: {error.message}"),
    )
    provider.load_from_path(path)
    for e in errors:
        print(f"{path}: {e}")
    if errors:
        failed = True
    else:
        print(f"{path}: ok (GTK {version})")

sys.exit(1 if failed else 0)
