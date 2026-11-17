// Review's shared state, and the terminal a review is about.
// Shared keys: review.mode ("branch" | "uncommitted" | "sent"), review.open (terminal -> {path, at}: the file to jump to), review.tabs (terminal -> its
// review tab's name), review.comments / review.viewed (repo key -> comments / path -> diff fingerprint), review.pick
// (terminal -> {url, branch, dir}: the stack PR its review tab shows instead of its own worktree).
// PR facts (the base branch, each PR's worktree) come from the work badge's work.prs.
import { spaces, panes, focused, terminals, props, run, notify, shared, setShared, layout, hc } from "herdr";

export const mode = () => shared("review.mode") ?? "branch";
export const tied = () => props()?.agent ?? null;
export const tabsOf = () => shared("review.tabs") ?? {};
const machineOf = (address) => (address?.includes("/") ? address.split("/")[0] : null);
const branchOf = (terminal) => panes().find((p) => p.terminal === terminal)?.branch ?? null;

// The terminal a review is about: the tab's own; in the sidebar, the focused pane's, or a focused review tab's terminal.
// A review tab (and the sidebar beside it) shows the stack PR picked for its terminal, if any, from that PR's worktree.
export function target() {
  const t = terminalTarget(), pick = t.tab ? picksOf()[t.terminal] : null;
  return pick ? { ...t, cwd: pick.dir, on: null, branch: pick.branch, pick } : t;
}
function terminalTarget() {
  if (tied()) return { tab: true, terminal: tied(), cwd: panes().find((p) => p.terminal === tied())?.cwd || props().cwd, on: props().on ?? null, branch: branchOf(tied()) };
  const f = focused(), pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  if (pane?.mod === "review") {
    const name = spaces().flatMap((s) => s.tabs).find((t) => t.id === pane.tab)?.name;
    const hit = Object.entries(tabsOf()).find(([, v]) => v.name === name);
    if (hit) return { tab: true, terminal: hit[0], cwd: panes().find((p) => p.terminal === hit[0])?.cwd || hit[1].cwd, on: hit[1].on ?? null, branch: branchOf(hit[0]) };
  }
  const space = spaces().find((s) => s.active), terminal = pane?.terminal ?? f?.terminal ?? null;
  const on = f?.pane === null ? machineOf(f.terminal) : space?.machine ?? null;
  return { terminal, cwd: pane?.cwd || f?.cwd || space?.folder, on, branch: branchOf(terminal) };
}

// The PR of a target's branch, from the work badge's poll (your open PRs and last week's merged ones). The repo must
// match too (a folder named like it, as clones and <repo>/.worktrees/* are): two repos can share a branch name.
// shortcut: PRs you didn't open aren't there, so their review compares with origin/main; ask gh per branch if that matters.
export function prFor({ branch, cwd }) {
  if (!branch || /^(main|master)$/.test(branch)) return null;
  const all = shared("work.prs"), parts = (cwd ?? "").split("/");
  return [...(all?.open ?? []), ...(all?.merged ?? [])].find((p) => p.branch === branch && parts.includes(p.repo)) ?? null;
}

// ---- Stacks: open PRs chained by base -> branch, one per agent (an orchestrator's, or the one its own branch is in).

export const picksOf = () => shared("review.pick") ?? {};
const openPRs = () => shared("work.prs")?.open ?? [];

// The PRs chained to p in its repo, from the one on main up (a fork above p is walked depth first).
export function chain(p, all = openPRs()) {
  const mine = all.filter((x) => x.owner === p.owner), out = [p];
  for (let x = mine.find((y) => y.branch === p.base); x && !out.includes(x); x = mine.find((y) => y.branch === x.base)) out.unshift(x);
  const up = (x) => { for (const y of mine.filter((y) => y.base === x.branch && !out.includes(y))) { out.push(y); up(y); } };
  up(p);
  return out;
}
// Every chain of 2+ open PRs, from each bottom PR (one whose base is no open PR's branch).
export function allStacks(all = openPRs()) {
  return all.filter((p) => !all.some((y) => y.owner === p.owner && y.branch === p.base)).map((p) => chain(p, all)).filter((s) => s.length > 1);
}
{
  const pr = (n, base) => ({ owner: "o/r", url: `u${n}`, branch: `b${n}`, base });
  const a = pr(1, "main"), b = pr(2, "b1"), c = pr(3, "b2"), d = pr(4, "main");
  if (chain(b, [c, a, b, d]).map((p) => p.url).join() !== "u1,u2,u3" || allStacks([c, a, b, d]).length !== 1) throw new Error("stack self-check failed");
}

// A terminal's stack: the one its "stack" label names (a PR URL; agents set it with hc label), else the one its own
// branch's PR is in.
export function stackFor(terminal) {
  const url = terminal ? terminals().find((k) => k.address === terminal)?.labels?.stack : null;
  const pane = panes().find((p) => p.terminal === terminal), own = terminal && !url ? prFor({ branch: pane?.branch, cwd: pane?.cwd }) : null;
  const seed = url ? openPRs().find((p) => p.url === url) : own?.state === "OPEN" ? own : null;
  const prs = seed ? chain(seed) : [];
  return { prs: url || prs.length > 1 ? prs : [], url: url ?? null };
}
// Links a terminal to the stack of the PR at `url` (none: unlinks), as an agent would with hc label.
export async function link(terminal, url) {
  const r = await hc(["label", terminal, `stack=${url ?? ""}`]);
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
}

export function showPanel(id) { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }

// The PR a review tab shows instead of its terminal's worktree (null: back to the worktree).
export function setPick(terminal, p) {
  const all = { ...picksOf() };
  if (p) all[terminal] = { url: p.url, branch: p.branch, dir: p.dir }; else delete all[terminal];
  setShared("review.pick", all);
}

// What a review shows depends on these; any change starts it over. The PR's base is in it, so a stacked PR's
// review compares with its base branch from the first load.
export const key = () => { const t = target(); return JSON.stringify([t.cwd, t.on, mode(), prFor(t)?.base ?? null]); };

// Per-repo maps in shared state (an empty value removes the repo's entry).
const getIn = (name, ck, fallback) => (shared(name) ?? {})[ck] ?? fallback;
function setIn(name, ck, value, empty) {
  const all = { ...(shared(name) ?? {}) };
  if (empty) delete all[ck]; else all[ck] = value;
  setShared(name, all);
}
export const commentsOf = (ck) => getIn("review.comments", ck, []);
export const setComments = (ck, list) => setIn("review.comments", ck, list, !list.length);
export const viewedOf = (ck) => getIn("review.viewed", ck, {});
export const setViewed = (ck, map) => setIn("review.viewed", ck, map, !Object.keys(map).length);

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) { const f = find(child, id); if (f) return f; }
  return null;
}

// On screen: the sidebar while the panel shows Review; a review tab while it is the active space's active tab.
export function onScreen() {
  if (!tied()) { const root = layout(); return !find(root, "panel")?.hidden && find(root, "panel-body")?.active === "changes"; }
  const name = tabsOf()[tied()]?.name;
  return Boolean(spaces().find((s) => s.active)?.tabs.find((t) => t.name === name)?.active);
}

// Opens the terminal's review tab, or shows it, at `path` when given, with the file list beside it. With `pr` (a
// Stack pane click) the tab shows that PR; from a review tab it keeps its PR; else (⌘⇧G, an agent pane's file list)
// the terminal's own worktree. Entries for terminals that are gone are dropped on the way.
export function openTab(path, pr) {
  const t = target();
  if (!t.terminal) { notify({ title: "Focus a terminal first", body: "A review tab belongs to the terminal it was opened from.", level: "warning" }); return; }
  const live = new Set(terminals().filter((k) => k.state === "live").map((k) => k.address));
  const alive = (obj) => Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => live.has(k)));
  // No path (cmd-shift-g): drop an old sidebar click, or a new tab would jump to it.
  const opens = alive(shared("review.open"));
  if (path) opens[t.terminal] = { path, at: Date.now() }; else delete opens[t.terminal];
  setShared("review.open", opens);
  const picks = alive(picksOf());
  if (pr) picks[t.terminal] = { url: pr.url, branch: pr.branch, dir: pr.dir }; else if (!t.pick) delete picks[t.terminal];
  setShared("review.pick", picks);
  const tabs = alive(tabsOf()), space = spaces().find((s) => s.active);
  const existing = tabs[t.terminal] && space?.tabs.find((x) => x.name === tabs[t.terminal].name);
  if (existing) run("tab.select", { id: existing.id });
  else {
    const pane = panes().find((p) => p.terminal === t.terminal), tab = space?.tabs.find((x) => x.id === pane?.tab);
    let name = `Review · ${tab?.named ? tab.name : pane?.program?.name ?? t.terminal}`;
    // shortcut: tab names tie review tabs to terminals, so renaming a review tab unties it; tie by pane id if Herdr exposes one.
    if (Object.entries(tabs).some(([k, v]) => k !== t.terminal && v.name === name)) name += ` (${t.terminal})`;
    tabs[t.terminal] = { name, cwd: t.cwd, on: t.on };
    run("tab.new", { space: space?.id, name, mod: "review", props: { agent: t.terminal, cwd: t.cwd, on: t.on } });
  }
  setShared("review.tabs", tabs);
  showPanel("changes");
}
