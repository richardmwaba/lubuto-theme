// SPDX-License-Identifier: GPL-3.0-or-later

// GJS keeps the wrapper of a GObject that C code disposed, and every access
// through it logs a critical instead of throwing. The wrapper's string form
// is the one tell that costs nothing.
export function isDisposed(object) {
    const tag = object.toString();
    return tag.includes('(DISPOSED)') || tag.includes('(FINALIZED)');
}
