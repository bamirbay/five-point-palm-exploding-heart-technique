// The Stack pane (right panel, ⌘⇧K): the focused agent's stack of open PRs (state.js stackFor), from the one on main
// up. A click opens that agent's review tab on the PR, from the PR's worktree; comments sent there go to the agent and
// name the PR. An agent with no stack lists every stack of your open PRs, to link one (the label agents set themselves
// with hc label).
import { div } from "gpui-kit";
import { h_flex, v_flex, Scrollbar } from "gpui-base";
import { exec, panes, spaces, theme } from "herdr";
import { target, stackFor, allStacks, link, openTab, picksOf, commentsOf } from "./state.js";
import { C } from "./git.js";

const TONE = { bad: C.red, good: C.green };
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
    const t = theme(), terminal = target().terminal, { prs, url } = stackFor(terminal), picked = picksOf()[terminal]?.url;
    const pane = panes().find((p) => p.terminal === terminal), tab = spaces().flatMap((s) => s.tabs).find((x) => x.id === pane?.tab);
    const chip = (id, label, action) => div().id(id).flex_none().px(6).py(1).rounded(4).border_1().border_color(t.border).text_size(11).text_color(t.dim)
      .cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => { cx.stop_propagation(); action(cx); }).child(label);
    const dim = (text) => div().p(8).text_size(12).text_color(t.dim).child(text);

    const row = (p, i) => {
      const drafts = p.dir ? commentsOf(`comments:${JSON.stringify([null, p.dir])}`).length : 0;
      return h_flex().id(`st-${p.url}`).flex_none().px(8).py(6).gap(8).items_center().rounded(7)
        .when(picked === p.url, (e) => e.bg(t.selected))
        .when(Boolean(p.dir), (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => openTab(null, p)))
        .when(!p.dir, (e) => e.opacity(0.5).tooltip("No local worktree for this branch"))
        .child(div().w(18).flex_none().text_size(11).text_color(t.dim).child(`${i + 1}`))
        .child(div().flex_none().text_size(12).text_color(TONE[p.tone] ?? t.muted).child(p.label ?? `#${p.number}`))
        .child(div().flex_1().min_w(0).truncate().child(short(p.title)))
        .when(p.unresolved > 0, (e) => e.child(div().flex_none().text_size(11).text_color(C.amber).child(`${p.unresolved} thread${p.unresolved === 1 ? "" : "s"}`)))
        .when(drafts > 0, (e) => e.child(div().flex_none().px(4).rounded(4).bg(C.comment).text_size(10.5).child(`${drafts} draft${drafts === 1 ? "" : "s"}`)))
        .child(chip(`gh-${p.url}`, "↗", () => { exec("open", [p.url]).catch(() => null); }));
    };
    const stackRow = (s) => h_flex().id(`link-${s[0].url}`).flex_none().px(8).py(6).gap(8).items_center().rounded(7)
      .child(div().flex_1().min_w(0).truncate().child(short(s[0].title)))
      .child(div().flex_none().text_size(11).text_color(t.dim).child(`#${s[0].number}…#${s.at(-1).number} (${s.length})`))
      .child(chip(`do-link-${s[0].url}`, "Link", (cx) => this.act(cx, () => link(terminal, s.at(-1).url))));

    let body;
    if (!terminal) body = [dim("Focus an agent to see its stack")];
    else if (prs.length) body = prs.map(row);
    else {
      const stacks = allStacks();
      body = [dim(url ? "Its linked PR is no longer open." : "No stack for this agent."),
        ...(stacks.length ? [dim("Link one of your stacks:"), ...stacks.map(stackRow)] : [dim("You have no stacked PRs open.")]),
        dim("Agents link theirs with: hc label $HC_TERMINAL_ID stack=<PR url>")];
    }

    return v_flex().id("stack").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border)
      .text_color(t.foreground).text_size(13).track_focus(this.handle)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().flex_none().child("Stack"))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(prs.length ? `${short(prs[0].title)} · ${prs.length} PRs` : ""))
        .when(Boolean(url), (e) => e.child(chip("unlink", "Unlink", (cx) => this.act(cx, () => link(terminal, null))))))
      .when(Boolean(terminal && prs.length), (e) => e.child(div().px(14).pt(6).text_size(10.5).text_color(t.dim).child(`Comments go to ${tab?.name || pane?.program?.name || terminal}`)))
      .when(Boolean(this.note), (e) => e.child(div().px(10).py(6).text_size(11).text_color(C.red).child(this.note)))
      .child(div().flex_1().min_h(0).relative()
        .child(v_flex().id("stack-list").absolute().inset_0().overflow_y_scroll().p(6).gap(2).children(body))
        .child(Scrollbar.vertical("stack-list").absolute().inset_0()));
  }
}
