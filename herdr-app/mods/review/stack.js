// The Stack pane (right panel, ⌘⇧K): the focused agent's stacks of open PRs (state.js stacksFor), each from the one on
// main up (GitHub's stacks; base -> branch chains for PRs in none). A click opens that agent's review tab on the PR, from the PR's worktree; comments sent there go to the agent
// and name the PR. Below: your other stacks, to link (the same label agents set themselves with hc label).
import { div } from "gpui-kit";
import { h_flex, v_flex, Scrollbar } from "gpui-base";
import { exec, panes, spaces, theme } from "herdr";
import { target, stacksFor, allStacks, link, openTab, picksOf, commentsOf, stackUrl } from "./state.js";
import { C } from "./git.js";

const FAILED = new Set(["FAILURE", "ERROR"]), MERGED = "#a371f7";
// "[Area] [5/8] feat(api): add y" -> "add y".
const short = (title) => title.replace(/^(\[[^\]]*\]\s*)+/, "").replace(/^\w+(\([^)]*\))?!?:\s*/, "");
// A stack's name: the [tag] or commit scope most of its titles share ("Entity Parsing", "coding-agent-insights"), else
// its first PR's title.
const tag = (title) => /^\[([^\]]+)\]/.exec(title)?.[1] ?? /^\w+\(([^)]+)\)!?:/.exec(title)?.[1] ?? null;
function stackName(prs) {
  const count = {};
  for (const p of prs) { const k = tag(p.title); if (k) count[k] = (count[k] ?? 0) + 1; }
  const [best, n] = Object.entries(count).sort((a, b) => b[1] - a[1])[0] ?? [];
  return n * 2 > prs.length ? best : short(prs[0].title);
}
if (short("[Entity Parsing] [5/8] feat(api): expose x") !== "expose x" || short("fix: y") !== "y"
  || stackName([{ title: "[Entity Parsing] [5/8] feat(api): a" }, { title: "[Entity Parsing] [6/8] feat(api): b" }]) !== "Entity Parsing"
  || stackName([{ title: "feat(core): a" }, { title: "feat(cai): b" }, { title: "feat(cai): c" }]) !== "cai"
  || stackName([{ title: "feat(x): add a" }, { title: "feat(y): b" }]) !== "add a") throw new Error("stack title self-check failed");

export class StackPane {
  constructor(cx) { this.handle = cx.focus_handle(); this.note = null; }
  command(name) { if (name === "focus") this.handle.focus(); }

  act(cx, f) {
    this.note = null;
    cx.spawn(async (cx) => { try { await f(); } catch (e) { this.note = String(e.message ?? e); } cx.notify(); });
  }

  render(cx) {
    const t = theme(), terminal = target().terminal, stacks = stacksFor(terminal), picked = picksOf()[terminal]?.url;
    const pane = panes().find((p) => p.terminal === terminal), tab = spaces().flatMap((s) => s.tabs).find((x) => x.id === pane?.tab);
    const chip = (id, label, action) => div().id(id).flex_none().px(6).py(1).rounded(4).border_1().border_color(t.border).text_size(12).text_color(t.dim)
      .cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => { cx.stop_propagation(); action(cx); }).child(label);
    const dim = (text) => div().px(8).py(6).text_size(12).text_color(t.dim).child(text);

    // Line 1: position, title, the PR's number (opens it on GitHub). Line 2: the review state (or Draft, Merged, Closed)
    // in a fixed-width slot, then "<icon> CI", so CI lines up on every row; your unsent comments on the right. One text
    // size. Only open PRs with a local worktree open a review.
    const row = (si) => (p, i) => {
      const open = p.state === "OPEN", drafts = p.dir ? commentsOf(`comments:${JSON.stringify([null, p.dir])}`).length : 0;
      const ci = open && p.ci ? (p.ci === "SUCCESS" ? ["✓", C.green] : FAILED.has(p.ci) ? ["✗", C.red] : ["●", C.amber]) : null;
      const [word, color] = p.state === "MERGED" ? ["Merged", MERGED] : p.state === "CLOSED" ? ["Closed", t.dim] : p.draft ? ["Draft", t.dim]
        : p.review === "APPROVED" ? ["Approved", C.green] : p.review === "CHANGES_REQUESTED" ? ["Changes requested", C.red] : ["Waiting on review", C.amber];
      return v_flex().id(`st-${si}-${p.url}`).flex_none().px(8).py(6).gap(3).rounded(7).text_size(12)
        .when(picked === p.url, (e) => e.bg(t.selected))
        .when(open && Boolean(p.dir), (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => openTab(null, p)))
        .when(open && !p.dir, (e) => e.opacity(0.5).tooltip("No local worktree for this branch"))
        .child(h_flex().gap(8).items_center()
          .child(div().w(18).flex_none().text_color(t.dim).child(`${i + 1}`))
          .child(div().flex_1().min_w(0).truncate().text_color(open ? t.foreground : t.dim).child(short(p.title)))
          .child(chip(`gh-${si}-${p.url}`, `#${p.number}`, () => { exec("open", [p.url]).catch(() => null); }).tooltip("Open on GitHub")))
        .child(h_flex().pl(26).gap(8).items_center()
          .child(div().w(116).flex_none().truncate().text_color(color).child(word))
          .child(h_flex().flex_1().min_w(0).gap(4).items_center().when(Boolean(ci), (e) => e.child(div().text_color(ci[1]).child(ci[0])).child(div().text_color(ci[1]).child("CI"))))
          .when(drafts > 0, (e) => e.child(div().flex_none().text_color(C.hunkText).child(`${drafts} unsent comment${drafts === 1 ? "" : "s"}`))));
    };
    // A stack's line: repo, name (a GitHub stack's name opens its page), then what goes on the right. Section headings
    // and Link rows share it.
    const stackLine = (id, prs, ...right) => {
      const url = stackUrl(prs[0]);
      return h_flex().id(id).flex_none().h(28).px(8).gap(8).items_center()
        .child(div().flex_none().text_size(12).font_semibold().child(prs[0].repo))
        .child(h_flex().flex_1().min_w(0).child(div().id(`${id}-name`).min_w(0).truncate().text_size(12).text_color(t.muted).child(stackName(prs))
          .when(Boolean(url), (e) => e.cursor_pointer().hover((s) => s.text_color(t.foreground)).tooltip("Open the stack on GitHub")
            .on_click((_e, cx) => { cx.stop_propagation(); exec("open", [url]).catch(() => null); }))))
        .children(right.filter(Boolean));
    };
    const stackRow = (s) => stackLine(`link-${s[0].url}`, s, chip(`do-link-${s[0].url}`, "Link", (cx) => this.act(cx, () => link(terminal, `stack.${s[0].stack ?? s[0].number}`, stackUrl(s[0]) ?? s.at(-1).url))));
    // A stack's heading (with its GitHub stack's number) and its PRs. Unlink when a label made it (not for the agent's
    // own branch's stack).
    const unlink = (s, si) => s.key && chip(`unlink-${si}`, "Unlink", (cx) => this.act(cx, () => link(terminal, s.key, null)));
    const section = (s, si) => [
      s.prs.length ? stackLine(`sec-${si}`, s.prs,
        s.prs[0].stack && chip(`gh-stack-${si}`, `#${s.prs[0].stack}`, () => { exec("open", [stackUrl(s.prs[0])]).catch(() => null); }).tooltip("Open the stack on GitHub"), unlink(s, si)).when(si > 0, (e) => e.mt(10))
        : h_flex().id(`sec-${si}`).flex_none().h(28).px(8).gap(8).items_center().when(si > 0, (e) => e.mt(10))
          .child(div().flex_1().text_size(12).text_color(t.muted).child("Linked PR no longer open")).children([unlink(s, si)].filter(Boolean)),
      ...s.prs.map(row(si)),
    ];
    const shown = new Set(stacks.flatMap((s) => s.prs.map((p) => p.url)));
    const others = terminal ? allStacks().filter((s) => !shown.has(s[0].url)) : [];
    const who = tab?.name || pane?.program?.name || terminal;
    const status = !terminal ? "Focus an agent" : !stacks.length ? "No stack for this agent" : `comments go to ${who}`;
    const label = (text) => div().px(8).pt(stacks.length ? 16 : 4).pb(4).text_size(11).text_color(t.dim).child(text);
    const body = [...stacks.flatMap(section), ...(others.length ? [label(stacks.length ? "Link another" : "Link one of your stacks"), ...others.map(stackRow)] : [])];
    if (terminal && !body.length) body.push(dim("You have no stacked PRs open."));

    return v_flex().id("stack").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border)
      .text_color(t.foreground).text_size(13).track_focus(this.handle)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().flex_none().child("Stack"))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(status)))
      .when(Boolean(this.note), (e) => e.child(div().px(10).py(6).text_size(11).text_color(C.red).child(this.note)))
      .child(div().flex_1().min_h(0).relative()
        .child(v_flex().id("stack-list").absolute().inset_0().overflow_y_scroll().p(6).gap(2).children(body))
        .child(Scrollbar.vertical("stack-list").absolute().inset_0()));
  }
}
