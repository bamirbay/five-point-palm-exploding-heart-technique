#!/bin/sh
# Links this repo's pieces into the places Herdr and Claude read them from. Safe to run again: it only replaces links,
# never a real file or folder (move yours away first). Re-linking also makes Herdr reload the mods: it watches its own
# folder, not this repo, so run this after editing anything in herdr-app/.
set -e
R=$(cd "$(dirname "$0")" && pwd)
link() { # <path in this repo> <where it goes>
  if [ -e "$2" ] && [ ! -L "$2" ]; then echo "skipped $2: a real file is there (move it away, then run this again)"; return; fi
  # A new link renamed over the old one, so the file is never missing: Herdr writes a default keys.json (plain ⌘W
  # closes the tab) the moment it is. shortcut: mv -h is macOS; on Linux it is mv -T.
  mkdir -p "$(dirname "$2")" && ln -sfn "$R/$1" "$2.new" && mv -fh "$2.new" "$2" && echo "linked $2"
}
H=~/.config/herdr-app
link herdr-app/keys.json "$H/keys.json"
for f in "$R"/herdr-app/layouts/*.json; do link "herdr-app/layouts/${f##*/}" "$H/layouts/${f##*/}"; done
for d in "$R"/herdr-app/mods/*/; do d=${d%/}; link "herdr-app/mods/${d##*/}" "$H/mods/${d##*/}"; done
for f in "$R"/herdr-core/templates/*.md; do link "herdr-core/templates/${f##*/}" ~/.config/herdr-core/templates/"${f##*/}"; done
link AGENTS.md ~/.claude/CLAUDE.md
link AGENTS.md ~/.codex/AGENTS.md
for d in "$R"/skills/*/; do d=${d%/}; link "skills/${d##*/}" ~/.claude/skills/"${d##*/}"; done
