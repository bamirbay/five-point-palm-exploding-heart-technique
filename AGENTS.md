# How to talk to me

Keep replies short. Answer or result first, in a few lines. No recaps of what I said, no long caveat lists, no surveys of options unless I ask. Use a table only when it replaces more prose. At most one question at the end.

# Git
- Branch: `bekzat/<issue-key>-<short-desc>`, lowercase (`bekzat/aei-1835-fix-dedupe`); no Linear issue: `bekzat/<short-desc>`.
- Worktree: off origin/main with Worktrunk: `git fetch && wt switch -c bekzat/<name> --base origin/main --no-cd --yes`. It lands in `<repo>/.worktrees/<everything after bekzat/>` with `.env` files and `node_modules` copied in. Never edit the main checkout; don't `git pull` it unless asked.
- Work that needs more than one PR: use the `stacked-prs` skill.

# Code
Write code in ponytail mode (the `ponytail` skill): the smallest complete change.

# In Herdr (when `$HC_TERMINAL_ID` is set)
- For parallel work, read `hc --skill` first, then start helpers with `hc run --bg --name <name> --cwd <worktree> claude "<task>. Report with hc send $HC_TERMINAL_ID when done or stuck."`
- Before opening a PR (not on every change): start both reviewers in parallel, then `hc wait --children all`:
  - `hc run --bg --name review-correctness --cwd <worktree> review-correctness "Report to $HC_TERMINAL_ID"`
  - `hc run --bg --name review-quality --cwd <worktree> review-quality "Report to $HC_TERMINAL_ID"`
  Fix their "Must fix" items, give me the quality findings as proposals, then `hc kill` and `hc rm` both reviewers.
