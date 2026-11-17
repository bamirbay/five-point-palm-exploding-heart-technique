---
name: stacked-prs
description: Plan, build and maintain a stack of dependent PRs (each PR based on the one below), with implementer agents and review comments relayed to them. Use when work is too big for one review, when the user asks for a stack or for tickets that become PRs, or when review comments arrive for a PR of a stack.
---

# Stacked PRs

## When to stack

- Stack when the work is too big for one review and splits into steps where each step needs the one below.
- One PR when it fits one review.
- Chain only real dependencies. Parts that don't depend on each other branch off main (or off the PR they need) and
  run in parallel. Every link in a chain costs a restack when something below it changes.

## Plan

1. Agree on the design with the user first.
2. One Linear ticket per PR. No parent ticket unless the user asks for one.
3. Order the tickets bottom up: contracts, types and models first.
4. Stop after the bottom PRs that set the contract (event shapes, models, APIs). Ask the user to review them before
   anyone builds on top: that is the cheapest point to change direction.

## Build

- Each PR gets its own branch and worktree, made off the branch below (the bottom one off origin/main):
  `git fetch && git worktree add -b bekzat/<key>-<desc> .worktrees/<key>-<desc> <branch below>`
- Open it against the branch below: `gh pr create --base <branch below>`.
- Implementers: `hc run --bg --name <key> --cwd <worktree> claude "<ticket, task>. Report with hc send $HC_TERMINAL_ID when done or stuck."`
  Start a PR's implementer once the PR below it is pushed. Siblings can run in parallel.
- Fix review findings in the PR below with new commits on top. Don't amend or rebase a PR that others build on.

## Link the stack (in Herdr)

After each PR opens, label your own terminal with the newest PR at the top of the stack:

`hc label $HC_TERMINAL_ID stack=<url of the top PR>`

The user's Stack pane (⌘⇧K) then lists the whole stack for your session, and review comments from it come to you.
Use the top PR: the bottom one merges first. To unlink: `hc label $HC_TERMINAL_ID stack=`.

## Review comments

Comments from the Stack review start with `Review comments on PR #N (<branch>, worktree <path>):`. File paths are
the same in every worktree: work in the named worktree.

1. Small fix: do it yourself in that worktree. Bigger fix: start a fresh implementer there and give it the ticket,
   the PR and the comments. Don't resume the original one with `claude -c`: it takes the newest session in that
   folder, which can be a reviewer's.
2. Commit on top and push.
3. Restack every PR above it, bottom up. In each one's worktree: `git rebase <branch below>`, run the tests it
   touches, then `git push --force-with-lease`. (`git rebase --update-refs` skips branches checked out in other
   worktrees, so it does not do this.)
4. Tell the user which PRs moved.

## After the bottom PR merges

In the next PR's worktree: `git fetch && git rebase --onto origin/main <merged branch>`, then
`git push --force-with-lease` and `gh pr edit <number> --base main`. `--onto` drops the merged commits, also after a
squash merge. Then remove the merged PR's worktree and branch.
