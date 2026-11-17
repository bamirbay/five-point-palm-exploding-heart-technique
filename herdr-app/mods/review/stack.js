// The Stack pane (right panel, ⌘⇧K): the focused agent's stacks of open PRs (state.js stacksFor), each from the one on
// main up. A click opens that agent's review tab on the PR, from the PR's worktree; comments sent there go to the agent
// and name the PR. Below: your other stacks, to link (the same label agents set themselves with hc label).
import { div } from "gpui-kit";
import { h_flex, v_flex, Scrollbar } from "gpui-base";
import { exec, panes, spaces, theme } from "herdr";
import { target, stacksFor, allStacks, link, openTab, picksOf, commentsOf } from "./state.js";
import { C } from "./git.js";

const FAILED = new Set(["FAILURE", "ERROR"]);
// "[Area] [5/8] feat(api): add y" -> "add y".
const short = (title) => title.replace(/^(\[[^\]]*\]\s*)+/, "").replace(/^\w+(\([^)]*\))?!?:\s*/, "");
if (short("[Entity Parsing] [5/8] feat(api): expose x") !== "expose x" || short("fix: y") !== "y") throw new Error("stack title self-check failed");

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
    const chip = (id, label, action) => div().id(id).flex_none().px(6).py(1).rounded(4).border_1().border_color(t.border).text_size(11).text_color(t.dim)
      .cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => { cx.stop_propagation(); action(cx); }).child(label);
    const dim = (text) => div().p(8).text_size(12).text_color(t.dim).child(text);

    // Title and the PR number (opens it on GitHub); under it, its status: CI, review, open threads, unsent comments.
    const row = (si) => (p, i) => {
      const drafts = p.dir ? commentsOf(`comments:${JSON.stringify([null, p.dir])}`).length : 0, n = (k, w) => `${k} ${w}${k === 1 ? "" : "s"}`;
      const status = [
        p.draft && ["draft", t.dim],
        p.ci && (p.ci === "SUCCESS" ? ["✓ CI", C.green] : FAILED.has(p.ci) ? ["✗ CI", C.red] : ["• CI running", C.amber]),
        p.review === "APPROVED" ? ["approved", C.green] : p.review === "CHANGES_REQUESTED" ? ["changes requested", C.red] : null,
        p.unresolved > 0 && [n(p.unresolved, "thread"), C.amber],
        drafts > 0 && [n(drafts, "unsent comment"), C.hunkText],
      ].filter(Boolean);
      return v_flex().id(`st-${si}-${p.url}`).flex_none().px(8).py(6).gap(2).rounded(7)
        .when(picked === p.url, (e) => e.bg(t.selected))
        .when(Boolean(p.dir), (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => openTab(null, p)))
        .when(!p.dir, (e) => e.opacity(0.5).tooltip("No local worktree for this branch"))
        .child(h_flex().gap(8).items_center()
          .child(div().w(18).flex_none().text_size(11).text_color(t.dim).child(`${i + 1}`))
          .child(div().flex_1().min_w(0).truncate().child(short(p.title)))
          .child(chip(`gh-${si}-${p.url}`, `#${p.number}`, () => { exec("open", [p.url]).catch(() => null); }).tooltip("Open on GitHub")))
        .when(status.length > 0, (e) => e.child(h_flex().pl(26).gap(8).text_size(11).children(status.map(([text, color]) => div().text_color(color).child(text)))));
    };
    const stackRow = (s) => h_flex().id(`link-${s[0].url}`).flex_none().px(8).py(6).gap(8).items_center().rounded(7)
      .child(div().flex_none().text_size(12).font_semibold().child(s[0].repo))
      .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(short(s[0].title)))
      .child(chip(`do-link-${s[0].url}`, "Link", (cx) => this.act(cx, () => link(terminal, `stack.${s[0].number}`, s.at(-1).url))));
    // A stack's heading (repo, its bottom PR's title, count), with Unlink when a label made it (not for the agent's own branch's).
    const section = (s, si) => [
      h_flex().id(`sec-${si}`).flex_none().px(8).pt(si ? 14 : 6).pb(2).gap(8).items_center()
        .when(!s.prs.length, (e) => e.child(div().flex_1().text_size(11.5).text_color(t.muted).child("Linked PR no longer open")))
        .when(s.prs.length > 0, (e) => e.child(div().flex_none().text_size(11.5).font_semibold().child(s.prs[0]?.repo ?? ""))
          .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.muted).child(short(s.prs[0]?.title ?? "")))
          .child(div().flex_none().text_size(11).text_color(t.dim).child(`${s.prs.length} PRs`)))
        .when(Boolean(s.key), (e) => e.child(chip(`unlink-${si}`, "Unlink", (cx) => this.act(cx, () => link(terminal, s.key, null))))),
      ...s.prs.map(row(si)),
    ];

    const shown = new Set(stacks.flatMap((s) => s.prs.map((p) => p.url)));
    const others = terminal ? allStacks().filter((s) => !shown.has(s[0].url)) : [];
    const status = !terminal ? "Focus an agent" : !stacks.length ? "No stack for this agent" : stacks.length > 1 ? `${stacks.length} stacks` : "";
    const body = [...stacks.flatMap(section), ...(others.length ? [dim(stacks.length ? "Link another:" : "Link one of your stacks:"), ...others.map(stackRow)] : [])];
    if (terminal && !body.length) body.push(dim("You have no stacked PRs open."));

    return v_flex().id("stack").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border)
      .text_color(t.foreground).text_size(13).track_focus(this.handle)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().flex_none().child("Stack"))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(status)))
      .when(stacks.length > 0, (e) => e.child(div().px(14).pt(6).text_size(10.5).text_color(t.dim).child(`Comments go to ${tab?.name || pane?.program?.name || terminal}`)))
      .when(Boolean(this.note), (e) => e.child(div().px(10).py(6).text_size(11).text_color(C.red).child(this.note)))
      .child(div().flex_1().min_h(0).relative()
        .child(v_flex().id("stack-list").absolute().inset_0().overflow_y_scroll().p(6).gap(2).children(body))
        .child(Scrollbar.vertical("stack-list").absolute().inset_0()));
  }
}
