// Review's shared state, and what a review is about.
// Shared keys: review.views (terminal -> {pr: {url, branch, dir} | null, mode: "branch" | "uncommitted" | "sent"}: what
// that terminal's review shows, in its review tab and in the Changes sidebar alike), review.open (terminal -> {path,
// at}: the file to jump to), review.tabs (terminal -> its review tab's name), review.comments / review.viewed (repo key
// -> comments / path -> diff fingerprint).
// PR facts (the base branch, each PR's worktree, GitHub stacks) come from the work badge's work.prs.
import { spaces, panes, focused, terminals, props, run, notify, shared, setShared, layout, hc } from "herdr";

export const tied = () => props()?.agent ?? null;
export const tabsOf = () => shared("review.tabs") ?? {};
const machineOf = (address) => (address?.includes("/") ? address.split("/")[0] : null);
const branchOf = (terminal) => panes().find((p) => p.terminal === terminal)?.branch ?? null;

// What a review is about: its terminal (the tab's own; in the sidebar, the focused pane's or a focused review tab's)
// and that terminal's view. A chosen stack PR is read from the PR's worktree (pick: the PR, mode: the view's mode).
export function target() {
  const t = terminalTarget(), v = viewOf(t.terminal);
  return v.pr ? { ...t, cwd: v.pr.dir, on: null, branch: v.pr.branch, pick: v.pr, mode: v.mode } : { ...t, mode: v.mode };
}
export const mode = () => target().mode;
function terminalTarget() {
  if (tied()) return { terminal: tied(), cwd: panes().find((p) => p.terminal === tied())?.cwd || props().cwd, on: props().on ?? null, branch: branchOf(tied()) };
  const f = focused(), pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  if (pane?.mod === "review") {
    const name = spaces().flatMap((s) => s.tabs).find((t) => t.id === pane.tab)?.name;
    const hit = Object.entries(tabsOf()).find(([, v]) => v.name === name);
    if (hit) return { terminal: hit[0], cwd: panes().find((p) => p.terminal === hit[0])?.cwd || hit[1].cwd, on: hit[1].on ?? null, branch: branchOf(hit[0]) };
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

// ---- Stacks: GitHub's stacks of open PRs (p.stack, p.position, from the work badge's poll); for PRs in none, the PRs
// chained by base -> branch. An agent has the ones its labels name, and the one its own branch is in.

const openPRs = () => shared("work.prs")?.open ?? [];
const ghStacks = () => shared("work.prs")?.stacks ?? {};
export const stackUrl = (p) => (p?.stack ? `https://github.com/${p.owner}/stack/${p.stack}` : null);

// p's stack, bottom first: its GitHub stack in order, merged and closed PRs included (open ones are the poll's full
// entries); else the PRs chained to it in its repo (a fork above p is walked depth first).
export function chain(p, all = openPRs(), stacks = ghStacks()) {
  const entries = p.stack && stacks[`${p.owner}#${p.stack}`];
  if (entries) return [...entries].sort((a, b) => a.position - b.position)
    .map((e) => all.find((x) => x.url === e.url) ?? { ...e, draft: e.isDraft, owner: p.owner, repo: p.repo, stack: p.stack });
  if (p.stack) return all.filter((x) => x.owner === p.owner && x.stack === p.stack).sort((a, b) => a.position - b.position);
  const mine = all.filter((x) => x.owner === p.owner && !x.stack), out = [p];
  for (let x = mine.find((y) => y.branch === p.base); x && !out.includes(x); x = mine.find((y) => y.branch === x.base)) out.unshift(x);
  const up = (x) => { for (const y of mine.filter((y) => y.base === x.branch && !out.includes(y))) { out.push(y); up(y); } };
  up(p);
  return out;
}
// Every stack of 2+ open PRs: GitHub's, then chains from each bottom PR of the rest (one whose base is no PR's branch).
export function allStacks(all = openPRs(), stacks = ghStacks()) {
  const gh = new Map(), loose = all.filter((p) => !p.stack);
  for (const p of all) if (p.stack) gh.set(stackUrl(p), chain(p, all, stacks));
  const bottoms = loose.filter((p) => !loose.some((y) => y.owner === p.owner && y.branch === p.base));
  return [...gh.values(), ...bottoms.map((p) => chain(p, all, stacks))].filter((s) => s.length > 1);
}

// The PR a stack label points at: a GitHub stack URL (.../owner/repo/stack/N) names any PR of that stack.
function seedOf(url, all) {
  const m = /github\.com\/([^/]+\/[^/]+)\/stack\/(\d+)/.exec(url);
  return m ? all.find((p) => p.owner === m[1] && p.stack === Number(m[2])) : all.find((p) => p.url === url);
}
// A terminal's stacks: one per "stack" or "stack.<name>" label (a GitHub stack URL, or a PR URL; agents set them with
// hc label), plus the one its own branch's PR is in. A label whose stack is gone stays as an empty one, to unlink it.
export function stacksFrom(labels, own, all, stacks = {}) {
  const out = [], shown = (url) => out.some((s) => s.prs.some((p) => p.url === url));
  for (const [key, url] of Object.entries(labels ?? {})) {
    if (!/^stack(\..+)?$/.test(key) || !url) continue;
    const seed = seedOf(url, all);
    if (!seed || !shown(seed.url)) out.push({ key, prs: seed ? chain(seed, all, stacks) : [] });
  }
  if (own && !shown(own.url)) { const prs = chain(own, all, stacks); if (prs.length > 1) out.push({ key: null, prs }); }
  return out;
}
{
  const pr = (n, base, stack = null, position = null) => ({ owner: "o/r", url: `u${n}`, branch: `b${n}`, base, stack, position });
  const all = [pr(1, "main"), pr(2, "b1"), pr(3, "b2"), pr(4, "main"), pr(5, "b4"), pr(7, "b6", 9, 2), pr(6, "main", 9, 1)];
  const gh = { "o/r#9": [{ position: 2, url: "u6" }, { position: 1, url: "u8", state: "MERGED" }, { position: 3, url: "u7" }] };
  const got = stacksFrom({ "stack.x": "u3", "stack.y": "u5", "stack.z": "u2", stack: "gone", "stack.g": "https://github.com/o/r/stack/9", "stack.g2": "u7", other: "u1" }, all[1], all, gh);
  if (got.map((s) => s.prs.map((p) => p.url).join("|") || "-").join(" ") !== "u1|u2|u3 u4|u5 - u8|u6|u7"
    || allStacks(all, gh).map((s) => s.map((p) => p.url).join("|")).join(" ") !== "u8|u6|u7 u1|u2|u3 u4|u5"
    || allStacks(all, {}).map((s) => s.map((p) => p.url).join("|")).join(" ") !== "u6|u7 u1|u2|u3 u4|u5") throw new Error("stacks self-check failed");
}
export function stacksFor(terminal) {
  if (!terminal) return [];
  const pane = panes().find((p) => p.terminal === terminal), own = prFor({ branch: pane?.branch, cwd: pane?.cwd });
  return stacksFrom(terminals().find((k) => k.address === terminal)?.labels, own?.state === "OPEN" ? own : null, openPRs(), ghStacks());
}
// Sets a terminal's stack label `key` to `url` (a stack or PR URL; none: unlinks), as an agent would with hc label.
export async function link(terminal, key, url) {
  const r = await hc(["label", terminal, `${key}=${url ?? ""}`]);
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
}

export function showPanel(id) { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }

// ---- Views: what a terminal's review shows. Only the Stack pane, [ ] in the review tab and the mode buttons change one
// (choose, setView); opening or showing a review never does. A chosen PR that is no longer open, or has no local
// worktree, falls back to the terminal's own worktree.
export function viewOf(terminal) {
  const v = (shared("review.views") ?? {})[terminal] ?? {};
  const p = v.pr && openPRs().find((x) => x.url === v.pr.url && x.dir);
  return { pr: p ? { url: p.url, branch: p.branch, dir: p.dir } : null, mode: v.mode ?? "branch" };
}
export function setView(terminal, patch) {
  if (!terminal) return;
  const all = { ...(shared("review.views") ?? {}) };
  all[terminal] = { ...(all[terminal] ?? {}), ...patch };
  setShared("review.views", all);
}
// A stack PR (shown in Branch mode: that PR's own diff), or null for the terminal's own worktree.
export const choose = (terminal, p) => setView(terminal, p ? { pr: { url: p.url, branch: p.branch, dir: p.dir }, mode: "branch" } : { pr: null });

// What a review shows depends on these; any change starts it over. The PR's base is in it, so a stacked PR's
// review compares with its base branch from the first load.
export const key = () => { const t = target(); return JSON.stringify([t.cwd, t.on, t.mode, prFor(t)?.base ?? null]); };

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

// Opens the terminal's review tab, or shows it, at `path` when given, with the file list beside it. It never changes
// what the review shows. Entries for terminals that are gone are dropped on the way.
export function openTab(path) {
  const t = terminalTarget();
  if (!t.terminal) { notify({ title: "Focus a terminal first", body: "A review tab belongs to the terminal it was opened from.", level: "warning" }); return; }
  const live = new Set(terminals().filter((k) => k.state === "live").map((k) => k.address));
  const alive = (obj) => Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => live.has(k)));
  // No path (cmd-shift-g): drop an old sidebar click, or a new tab would jump to it.
  const opens = alive(shared("review.open"));
  if (path) opens[t.terminal] = { path, at: Date.now() }; else delete opens[t.terminal];
  setShared("review.open", opens);
  setShared("review.views", alive(shared("review.views")));
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
