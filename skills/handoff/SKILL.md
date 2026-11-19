---
name: handoff
description: Write a handoff so another agent (Claude, Codex) can continue this work cold. Use when the user says "handoff", "hand this off", "write a handoff", or wants to pass work to another agent or session.
---

Write the handoff to `~/Developer/scratch/<yyyy-mm-dd>-<short-topic>.md` (today's date, lowercase kebab-case topic). The reader has none of this conversation: write so a cold agent can act on it.

Sections, in this order, each short:

- **Goal**: what done looks like, in one or two lines. Link the Linear issue or PR if there is one.
- **Where**: repo, branch, worktree path, and the commit it is at (`git rev-parse --short HEAD`).
- **State**: what is done, what is not, and whether there are uncommitted changes.
- **Next step**: the one thing to do first, concretely (file, command, decision).
- **Gotchas**: what was tried and failed, decisions made with the user and why, traps in the code or data.
- **Links**: files, PRs, queries in `~/Developer/notes/sql/`, other notes.

Do not paste diffs or long logs: point to the file or commit instead.

When done, print the full path and a ready-to-run line that starts the next agent in the user's current terminal:

```
cd <worktree> && claude "Read <full handoff path> and continue from Next step."
```

Do not start that agent unless the user asks.
