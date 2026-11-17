# Five Point Palm Exploding Heart Technique

My agent setup: a Herdr window for working with coding agents, plus the Claude instructions and skills it relies on.

The Herdr window:
- **Spaces** are projects. Each space can link to a Linear project.
- **Tabs** are agent sessions.
- **Review** shows a branch's diff. You comment on lines and send the comments to the agent.
- **PR and Linear panes** list your PRs and issues, each tied to the session that works on it.

## What's in it

| Path | What |
|---|---|
| `herdr-app/layouts/my-main.json` | The window: the stock `main` layout, plus the panes and the status bar badge below |
| `herdr-app/mods/my-spaces` | Spaces list. A space can link to a Linear project; `cmd-l` opens it in the Linear app |
| `herdr-app/mods/my-agents` | Agents list. Each row shows its repo, branch, Linear issue and PR (with CI and review state). Sub-agents can open beside the focused pane |
| `herdr-app/mods/review` | Each agent's review shows one thing: its own worktree, or a PR of its stacks, chosen in the Stack pane. The Changes sidebar lists that review's files (the branch's, the uncommitted ones, or only what changed since your last Send) and the review tab shows every file's diff in one scroll, with line comments sent to the agent. Both show the same, and opening the tab never changes it. For a stack PR, Send tells the agent which PR |
| `herdr-app/mods/work` | The PR pane, the Linear pane and the status bar badge. The badge polls GitHub and Linear and posts PR alerts |
| `herdr-app/mods/my-tabs` | The tab bar, with **PRs** (a red dot when a PR needs you), **Stack**, **Linear** and **Changes** buttons on the right. It also handles `cmd-w` and `cmd-shift-s`, because it is always on screen |
| `herdr-app/mods/my-pane` | Each pane's header. After the name it shows the branch's Linear issue and PR. Its close button follows the `cmd-w` rules |
| `herdr-app/keys.json` | Key bindings (see below) |
| `herdr-app/CLAUDE.md` | Notes for agents that edit the mods (run `./install.sh` after an edit) |
| `claude/CLAUDE.md` | Global Claude instructions, with the Herdr rules (sub-agents, reviewers). `~/.claude/CLAUDE.md` links here |
| `skills/` | Claude skills, each linked from `~/.claude/skills/`. grill-me (from mattpocock/skills), find-skills (vercel-labs/skills) and thermo-nuclear-code-quality-review (cursor/plugins) are copies of third-party skills: to update one, copy it again from its source |
| `herdr-core/templates/` | The two PR reviewers, as `hc` templates. They need the `ponytail-review` skill (ponytail plugin) and `thermo-nuclear-code-quality-review` |
| `install.sh` | Links everything into place (see Install) |

## Install

1. Clone this repo anywhere and run `./install.sh`. It links each piece where Herdr and Claude read it:
   - `herdr-app/keys.json`, `layouts/*.json` and each mod → `~/.config/herdr-app/`
   - `herdr-core/templates/*.md` → `~/.config/herdr-core/templates/`
   - `claude/CLAUDE.md` → `~/.claude/CLAUDE.md`, and each skill → `~/.claude/skills/`

   It never replaces a real file: move yours away first (merge your own `keys.json` and `CLAUDE.md` into the repo's).
   Then run `herdr-app do layout.switch --name my-main`.
2. Change the settings to yours:
   - `herdr-app/mods/work/main.js` top: `REPOS_DIR`.
   - `herdr-app/mods/my-agents/main.js` and `herdr-app/mods/my-pane/main.js`: `LINEAR`, the Linear workspace URL.
3. Linear: create a personal API key (Linear → Settings → Security & access).
   Run `security add-generic-password -s herdr-linear -a linear -w` and paste the key.
   The key stays in Keychain.
4. Node for hooks:
   - If Claude hooks fail with `node: command not found` in agents started by `hc`: those programs get your login
     session's PATH (it has `~/.local/bin` and Homebrew) and don't read shell profiles, so node from nvm or mise is
     missing. Link it there, as Herdr does with `hc`: `ln -s "$(command -v node)" ~/.local/bin/node`.
     No restart needed. Re-link after you switch node versions.

Herdr watches its own folder, not this repo: after editing anything in `herdr-app/`, run `./install.sh` again. Re-linking
makes Herdr reload.

Or tell your Claude: "add the Herdr setup from this repo".

## Keys

| Key | Action |
|---|---|
| `cmd-b` / `cmd-shift-b` | Left / right sidebar |
| `cmd-1..9`, `ctrl-1..9` | Tabs, spaces |
| `cmd-shift-up` / `down` | Previous / next space |
| `cmd-left` / `right` / `up` / `down` | Move to the pane in that direction |
| `cmd-r` / `cmd-shift-r` | Rename tab / space |
| `cmd-t`, `cmd-shift-t` | New tab, new Claude tab |
| `cmd-w`, `cmd-shift-w` | Close the pane. A terminal's pane asks first (Enter closes, Esc cancels). On a sub-agent, it goes back under its parent and keeps running. Never closes a space's last pane |
| `cmd-k` | Clear the terminal |
| `cmd-l` | Open the space's Linear project, or link one |
| `cmd-shift-g` | Review tab for the focused terminal, as you left it |
| `cmd-shift-i` / `cmd-shift-l` | PR pane / Linear pane (again: hide) |
| `cmd-shift-k` | Stack pane (again: hide). Stacks are GitHub's (PRs in none are grouped by base branch). An agent's stacks are the ones its `stack.<name>` labels name (`hc label $HC_TERMINAL_ID stack.<name>=<GitHub stack URL>`, or **Link** in the pane), plus the one its own branch is in. Clicking a row (or **This worktree**) chooses what the agent's review shows. In the review tab, `[` / `]` step through the PRs |
| `cmd-shift-s` | Open the focused agent's newest sub-agent to the right |

The review tab takes the keyboard when it opens (or after any click in it). Its keys, while no comment is being written
(`?` shows them in the tab):

| Key | Action |
|---|---|
| `j` / `k`, `↓` / `↑` | Next / previous line (`shift-↓` / `shift-↑` extend the selection) |
| `J` / `K` | Next / previous file |
| `space` / `shift-space`, `g` / `G` | Page down / up, top / bottom |
| `a`, `cmd-shift-c`, double-click | Comment on the selected lines; a header's "＋ comment" comments on the whole file |
| `cmd-enter` | Send the comments to the agent. In the comment box, `enter` saves and `shift-enter` starts a new line |
| `p` | Preview the message first; again (or `cmd-enter`) sends |
| `v`, `cmd-e` | Mark the file viewed (it folds in place; it reopens if the file changes) |
| `o`, `cmd-shift-e` | Show only this file (again: show all) |
| `esc` | Close the help, preview or comment box, or clear the selection |

## What it runs

- `git`: diffs, worktrees and cleanup. Each GitHub poll also lists each repo's worktrees, to find every PR's local one.
- `gh`: your PRs, review threads and PR links. `gh` must be logged in.
- `curl`: Linear's API, with the key read from Keychain.
- `hc send`: comments to agents. `hc label`: Link and Unlink in the Stack pane.
- `git add -A` into a copy of the index on each review Send (for Since sent). It is saved as `herdr-review-sent.index`
  in the worktree's git folder, and removing the worktree removes it.

Nothing runs on a timer except two polls, from the badge only: GitHub every 2 minutes and Linear every 5.
