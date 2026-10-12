#!/usr/bin/env bash
# Installs an icon or cursor theme from presets/icons.manifest.
#
# Usage: fetch-icons.sh <name> [--colour <lubuto colour>] [--dest <dir>] [--force]
#
# <name> is a manifest section. --colour picks the variant through the
# section's map (default: default). --dest is where the theme directories go
# (default: ~/.icons). An existing directory is kept unless --force is given.
# The last line of output is the theme name to put in the gsettings key.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$REPO_DIR/presets/icons.manifest"

name="${1:-}"
colour="default"
dest="$HOME/.icons"
force=false
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --colour) colour="$2"; shift 2 ;;
    --dest) dest="$2"; shift 2 ;;
    --force) force=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done
if [[ -z "$name" ]]; then
  sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi

# Reads one key of a manifest section.
field() {
  awk -v section="[$1]" -v key="$2" '
    $0 == section {inside = 1; next}
    /^\[/ {inside = 0}
    inside && $1 == key && $2 == "=" {
      sub(/^[^=]*= */, "")
      print
      exit
    }' "$MANIFEST"
}

kind="$(field "$name" kind)"
if [[ -z "$kind" ]]; then
  echo "No '$name' in $MANIFEST." >&2
  exit 1
fi
fetch="$(field "$name" fetch)"
url="$(field "$name" url)"
ref="$(field "$name" ref)"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$dest"

# Copies one theme directory into the destination, unless it is already there.
place() {
  local source="$1"
  local target="$dest/$(basename "$source")"
  if [[ -d "$target" && "$force" == false ]]; then
    echo "Keeping the existing $target (use --force to replace it)." >&2
    return 0
  fi
  if [[ ! -f "$source/index.theme" ]]; then
    echo "$source has no index.theme, not installing it." >&2
    exit 1
  fi
  rm -rf "$target"
  cp -r "$source" "$target"
  if [[ "$kind" == icons ]] && command -v gtk-update-icon-cache > /dev/null; then
    gtk-update-icon-cache -f -q "$target" 2> /dev/null || true
  fi
  echo "Installed $target" >&2
}

# Resolves the colour through the map: "lubuto:dir" or "lubuto:upstream:dir".
lookup() {
  local entry
  for entry in $(field "$name" map); do
    [[ "${entry%%:*}" == "$colour" ]] && { echo "$entry"; return 0; }
  done
  echo "No '$colour' in the $name map, falling back to default." >&2
  for entry in $(field "$name" map); do
    [[ "${entry%%:*}" == default ]] && { echo "$entry"; return 0; }
  done
  exit 1
}

# A cursor theme is one directory, so there is nothing to download when it
# is already in place.
if [[ "$kind" == cursor && "$force" == false ]]; then
  present=true
  for dir in $(field "$name" dirs); do
    [[ -d "$dest/$dir" ]] || present=false
  done
  if [[ "$present" == true ]]; then
    for dir in $(field "$name" dirs); do
      echo "Keeping the existing $dest/$dir (use --force to replace it)." >&2
      result="$dir"
    done
    echo "$result"
    exit 0
  fi
fi

case "$fetch" in
  git)
    commit="$(field "$name" commit)"
    echo "Cloning $url at $ref..." >&2
    git -c advice.detachedHead=false clone -q --depth 1 --branch "$ref" "$url" "$work/src"
    actual="$(git -C "$work/src" rev-parse HEAD)"
    if [[ -n "$commit" && "$actual" != "$commit" ]]; then
      echo "Tag $ref is at $actual, but the manifest pins $commit. Not installing." >&2
      exit 1
    fi
    ;;
  archive)
    sha256="$(field "$name" sha256)"
    echo "Downloading $url..." >&2
    curl -sfL -o "$work/archive" "$url"
    actual="$(sha256sum "$work/archive" | cut -d' ' -f1)"
    if [[ "$actual" != "$sha256" ]]; then
      echo "Checksum mismatch for $url: got $actual, expected $sha256. Not installing." >&2
      exit 1
    fi
    mkdir "$work/src"
    tar -xf "$work/archive" -C "$work/src"
    ;;
  *)
    echo "Unknown fetch method '$fetch'." >&2
    exit 1
    ;;
esac

installer="$(field "$name" install)"
if [[ "$kind" == cursor ]]; then
  result=""
  for dir in $(field "$name" dirs); do
    place "$work/src/$dir"
    result="$dir"
  done
elif [[ -n "$installer" ]]; then
  # The upstream installer builds the variant; the map says what it is called.
  entry="$(lookup)"
  upstream="$(cut -d: -f2 <<< "$entry")"
  result="$(cut -d: -f3 <<< "$entry")"
  if [[ -d "$dest/$result" && "$force" == false ]]; then
    echo "Keeping the existing $dest/$result (use --force to replace it)." >&2
  else
    command="${installer//DEST/$dest}"
    command="${command//COLOUR/$upstream}"
    (cd "$work/src" && eval "$command" > /dev/null 2>&1)
    [[ -f "$dest/$result/index.theme" ]] || { echo "$dest/$result has no index.theme." >&2; exit 1; }
    echo "Installed $dest/$result" >&2
  fi
else
  base="$(field "$name" base)"
  [[ -n "$base" ]] && place "$work/src/$base"
  entry="$(lookup)"
  result="${entry##*:}"
  [[ "$result" != "$base" ]] && place "$work/src/$result"
fi

echo "$result"
