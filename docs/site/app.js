// Landing page: a replica of the Compass sidebar running on scripted fake data.
// h(), icon(), card(), stepRow() and render() are adapted from extension/src/webview.ts so the cards match the real UI.
// The only changes: no vscode API, no persistence, and state lives in `st` below.
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const ICONS = {
    chev: "M2 3.5l3 3 3-3", open: "M9 3h4v4M13 3L7 9M12 10v3H3V4h3", copy: "M5.5 5.5h7v8h-7zM3.5 10.5v-8h7",
    panel: "M2.5 3h11v10h-11zM2.5 9.5h11", check: "M2.5 6.5l2.3 2.3 4.7-5", x: "M4 4l8 8M12 4l-8 8",
  };
  const DOT = { here: "b live", run: "g live", held: "a", idle: "", done: "g" };
  const st = { filter: "all", closed: new Set(), open: new Set(), seen: new Set(), model: null };

  function icon(name) {
    const sz = name === "chev" ? 10 : name === "check" ? 12 : 14, vb = name === "chev" ? 10 : name === "check" ? 12 : 16;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", sz); svg.setAttribute("height", sz); svg.setAttribute("viewBox", `0 0 ${vb} ${vb}`);
    svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", name === "check" ? 1.8 : 1.4);
    const p = document.createElementNS(NS, "path"); p.setAttribute("d", ICONS[name]); svg.append(p);
    return svg;
  }
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k === "on") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
    return el;
  }
  const flip = (key, open) => { st.seen.add(key); open ? st.open.delete(key) : st.open.add(key); draw(); };
  const toggleSet = (set, key) => { set.has(key) ? set.delete(key) : set.add(key); draw(); };
  const act = (title, name) => h("button", { class: "ib", title, "aria-label": title, on: { click: (e) => e.stopPropagation() } }, icon(name));

  function segments(c) {
    const bits = [];
    for (let i = 0; i < c.total; i++) bits.push(h("i", { class: i < c.done ? "on" : i >= c.total - c.held ? "hold" : "" }));
    return h("span", { class: "steps" }, bits);
  }
  function stepRow(c, s, key) {
    const open = st.seen.has(key) ? st.open.has(key) : !!(s.status === "now" && s.detail);
    const mark = s.status === "done" ? (() => { const w = h("span", { style: "color:var(--green)" }); w.append(icon("check")); return w; })()
      : s.status === "now" ? h("span", { class: "dot b live" })
      : (() => { const w = h("span", { style: "color:var(--faint)" }); const svg = document.createElementNS(NS, "svg"); svg.setAttribute("width", 12); svg.setAttribute("height", 12); svg.setAttribute("viewBox", "0 0 12 12"); svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", 1.4); const ci = document.createElementNS(NS, "circle"); ci.setAttribute("cx", 6); ci.setAttribute("cy", 6); ci.setAttribute("r", 4); svg.append(ci); w.append(svg); return w; })();
    return h("div", { class: "step " + s.status + (open ? " open" : ""), "data-d": s.detail ? true : null, tabindex: s.detail ? 0 : null, on: { click: () => { if (s.detail) flip(key, open); } } },
      h("div", { class: "s-row" }, h("span", { class: "s-ic" }, mark), h("span", { class: "s-t", title: s.text }, s.text), s.detail ? h("span", { class: "s-more" }, "Details") : null),
      s.detail ? h("div", { class: "detail" }, s.detail) : null);
  }
  function card(c) {
    const expandable = c.steps.length > 0, ckey = "c:" + c.id;
    const expanded = expandable && (st.seen.has(ckey) ? st.open.has(ckey) : c.open);
    const acts = [act("Open details", "open"), act("Copy session ID", "copy"), act("Show or hide Compass panel", "panel"), act("Hide this session", "x")];
    const meta = [segments(c), h("span", { class: "cnt" }, c.done + " of " + c.total), c.state === "here" ? h("span", { class: "chip blue" }, "this tab") : null, c.where ? h("span", { class: "chip", title: c.where }, c.where) : null];
    const head = h("div", { class: "card" + (c.state === "here" ? " sel" : ""), tabindex: 0, "aria-expanded": String(expanded), on: { click: () => flip(ckey, expanded) } },
      h("span", { class: "dot " + DOT[c.state] }),
      h("span", { class: "t", title: c.title }, h("span", { class: "caret" }, "›"), c.title),
      h("span", { class: "age" }, c.age), h("span", { class: "acts" }, acts), h("span", { class: "meta" }, meta),
      !expanded && c.now ? h("span", { class: "nowline", title: c.now }, "→ " + c.now) : null);
    const keys = c.steps.map((s, i) => "s:" + c.id + "#" + i);
    return [head, expanded ? h("div", { class: "stepsx" }, keys.map((k, i) => stepRow(c, c.steps[i], k))) : null];
  }
  let animateIn = true;
  function render() {
    const m = st.model; if (!m) return;
    const f = st.filter;
    const keep = (c) => f === "all" || (f === "active" ? c.state === "run" || c.state === "here" : c.state === "held");
    const s = m.summary, total = Math.max(1, s.sessions);
    const root = document.getElementById("root"); root.replaceChildren();
    const seg = (n, color) => n > 0 ? h("i", { style: "width:" + (n / total * 100) + "%;background:" + color }) : null;
    const leg = (n, cls, label) => n > 0 ? h("span", {}, h("span", { class: "dot " + cls }), label + " " + n) : null;
    root.append(h("div", { class: "summary" },
      h("div", { class: "s-top" }, h("span", {}, h("b", {}, s.sessions), " sessions"), s.here ? h("span", { class: "pill blue" }, s.here + " here") : null),
      h("div", { class: "stack" }, seg(s.here, "var(--blue)"), seg(s.running, "var(--green)"), seg(s.held, "var(--amber)"), h("i", { style: "flex:1;background:var(--surf2)" })),
      h("div", { class: "legend" }, leg(s.here, "b", "here"), leg(s.running, "g", "running"), leg(s.held, "a", "held"), leg(s.idle, "", "idle"))));
    root.append(h("div", { class: "seg", role: "group", "aria-label": "Filter" },
      ["all", "active", "held"].map((k) => h("button", { "aria-pressed": String(f === k), on: { click: () => { st.filter = k; draw(); } } }, k[0].toUpperCase() + k.slice(1)))));
    let n = 0;
    for (const g of m.groups) {
      const cards = g.cards.filter(keep);
      if (cards.length === 0 && f !== "all") continue;
      const open = !st.closed.has("g:" + g.repo);
      root.append(h("div", { class: "grp", tabindex: 0, role: "button", "aria-expanded": String(open), on: { click: () => toggleSet(st.closed, "g:" + g.repo) } },
        h("span", { class: "chev" }, icon("chev")), h("span", { class: "grow" }, g.repo), h("span", { class: "pill" }, cards.length)));
      if (open) for (const c of cards) root.append(...card(c).filter(Boolean));
    }
    if (animateIn) { root.querySelectorAll(".card").forEach((el, i) => { el.style.animationDelay = (0.25 + i * 0.09) + "s"; }); animateIn = false; }
    else root.querySelectorAll(".card").forEach((el) => { el.style.animation = "none"; });
  }
  // Step 2 shows one card's hover actions without a mouse; every redraw has to put the class back
  function draw() { render(); if (document.body.dataset.step === "2" && hoverDemo) { const c = document.querySelectorAll("#root .card")[1]; if (c) c.classList.add("demo-hover"); } }
  let hoverDemo = false;

  // ---- scripted fake data -------------------------------------------------
  const mk = (id, repo, title, where, state, age, texts, done, now, detail) => ({
    id, repo, title, where, state, age, done, open: state === "here",
    steps: texts.map((t, i) => ({ text: t, status: i < done ? "done" : (i === done && now ? "now" : "todo"), detail: i === done && now ? detail : undefined })),
  });
  const sessions = [
    mk("co", "storefront", "Refactor checkout flow", "feat/checkout", "here", "now", ["Map the checkout call sites", "Extract the pricing module", "Move tax rules over", "Update the order tests", "Remove the old helper"], 1, true, "Moving calculateTotal and its helpers into lib/pricing.ts."),
    mk("ca", "storefront", "Fix cart rounding", "fix/cart-rounding", "run", "1m", ["Reproduce the rounding bug", "Fix the total calculation", "Add a regression test", "Run the full suite"], 2, true),
    mk("au", "api-gateway", "Migrate auth tokens", "feat/refresh-tokens", "run", "4m", ["Audit token storage", "Add a refresh endpoint", "Migrate session cookies", "Update the client SDK", "Write the migration guide", "Roll out behind a flag"], 2, true),
    mk("rl", "api-gateway", "Rate limit headers", "feat/rate-limit", "done", "20m", ["Read the spec", "Add the headers", "Cover with tests", "Update the docs"], 4, false),
    mk("dc", "docs-site", "Rewrite install guide", "docs/install", "held", "paused 7h", ["Audit the install steps", "Rewrite the quick start", "Add the Windows section", "Check every command", "Publish"], 2, false),
    mk("ex", "mobile-app", "Upgrade Expo SDK", "chore/expo-sdk", "run", "9m", ["List breaking changes", "Bump the SDK", "Fix the build", "Re-test on device", "Update the changelog"], 0, true),
  ];
  const viewModel = () => {
    const by = new Map();
    for (const c of sessions) { if (!by.has(c.repo)) by.set(c.repo, []); by.get(c.repo).push({ ...c, kind: "session", total: c.steps.length, held: 0, now: (c.steps.find((s) => s.status === "now") || {}).text || "" }); }
    const all = sessions;
    const summary = { sessions: all.length, here: all.filter((c) => c.state === "here").length, running: all.filter((c) => c.state === "run").length, held: all.filter((c) => c.state === "held").length, idle: all.filter((c) => c.state === "done").length };
    return { summary, groups: [...by].map(([repo, cards]) => ({ repo, cards })), note: [] };
  };
  const refresh = () => { st.model = viewModel(); draw(); syncChrome(); };


  // ---- window chrome ------------------------------------------------------
  const win = document.getElementById("win"), body = document.body;
  const tabsEl = document.getElementById("tabs"), pane = document.getElementById("paneLines");
  const prompt = document.getElementById("prompt"), form = document.getElementById("promptForm");
  const stCompass = document.getElementById("stCompass"), stText = document.getElementById("stText");
  let sel = 0;

  const focused = () => sessions.find((c) => c.state === "here") || sessions[0];
  const nowOf = (c) => (c.steps.find((s) => s.status === "now") || {}).text || "";
  const STATE_DOT = { here: "#3794ff", run: "#73c991", held: "#cca700", done: "#73c991" };

  function drawTabs() {
    tabsEl.replaceChildren();
    sessions.forEach((c, i) => {
      const t = h("button", { class: "win-tab", role: "tab", "aria-selected": String(i === sel), on: { click: () => { sel = i; typed = false; drawTabs(); drawPane(); } } },
        h("span", { class: "tdot", style: "background:" + STATE_DOT[c.state] }),
        h("span", { class: "tt" }, `${c.done}/${c.steps.length} ${c.title}`));
      tabsEl.append(t);
    });
  }
  let typed = false; // step 3 prints /sessions into the pane; a tab click or a tick brings the plan back
  function drawPane() {
    if (typed) return;
    pane.replaceChildren();
    const c = sessions[sel];
    pane.append(h("p", {}, h("b", {}, c.title), "  ", c.where));
    c.steps.forEach((s) => pane.append(h("p", {}, (s.status === "done" ? "✓ " : s.status === "now" ? "● " : "○ ") + s.text)));
  }
  function printSessions() {
    pane.replaceChildren(h("p", { class: "dim" }, "> /sessions"));
    sessions.forEach((c) => pane.append(h("p", {}, `${c.repo}  ${c.where}  ${c.done}/${c.steps.length}  ${nowOf(c) || (c.state === "done" ? "finished" : "paused")}`)));
    typed = true;
  }
  function syncChrome() {
    const c = focused();
    document.title = `${c.done}/${c.steps.length} ${nowOf(c) || c.title} · Session Compass`;
    stText.textContent = `${c.done}/${c.steps.length} ${nowOf(c) || c.title}`;
    setFavicon(nowOf(c) ? "#4a9eed" : "#73c991");
    drawTabs(); drawPane();
  }
  function setFavicon(dot) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='10' fill='#1a1a1a' stroke='#ececec' stroke-width='1.6'/><path d='M15.5 8.5 13.4 13.4 8.5 15.5 10.6 10.6Z' fill='#F0B429'/><circle cx='19' cy='5' r='4.2' fill='${dot}' stroke='#1a1a1a' stroke-width='1.4'/></svg>`;
    document.getElementById("favicon").href = "data:image/svg+xml," + encodeURIComponent(svg);
  }

  // ---- scripted ticks: running sessions advance a step now and then --------
  const running = () => sessions.filter((c) => c.state === "run" || c.state === "here");
  function advance(c) {
    const i = c.steps.findIndex((s) => s.status === "now");
    if (i < 0) return;
    c.steps[i].status = "done"; c.steps[i].detail = undefined; c.done++;
    const next = c.steps[i + 1];
    if (next) next.status = "now"; else c.state = "done";
    c.age = "now";
  }
  let which = 0;
  setInterval(() => {
    const r = running(); if (!r.length) return;
    advance(r[which++ % r.length]);
    stCompass.classList.remove("tick"); void stCompass.offsetWidth; stCompass.classList.add("tick");
    typed = false; refresh();
  }, 3600);

  // ---- scroll steps: the window re-angles and a different part lights up ---
  const stepEls = [...document.querySelectorAll(".lp-step")];
  let demoTimer = null;
  function setStep(n) {
    if (body.dataset.step === String(n) && body.dataset.ready) return;
    body.dataset.step = String(n); body.dataset.ready = "1";
    stepEls.forEach((el) => el.setAttribute("aria-current", String(el.dataset.step === String(n))));
    clearTimeout(demoTimer);
    hoverDemo = false;
    document.querySelectorAll(".card.demo-hover").forEach((el) => el.classList.remove("demo-hover"));
    typed = false; drawPane();
    if (n === 2) demoTimer = setTimeout(() => { hoverDemo = true; draw(); }, 900);
    if (n === 3) demoTimer = setTimeout(printSessions, 900);
  }
  const io = new IntersectionObserver((entries) => {
    entries.filter((e) => e.isIntersecting).forEach((e) => setStep(Number(e.target.dataset.step)));
  }, { rootMargin: "-45% 0px -45% 0px" });
  stepEls.forEach((el) => io.observe(el));
  setStep(1);

  // ---- fit the 880px stage to its column ------------------------------------
  const box = document.getElementById("stagebox");
  const fit = () => box.style.setProperty("--fit", String(Math.min(1, box.clientWidth / 880)));
  new ResizeObserver(fit).observe(box); fit();

  // ---- theme toggle (same key and attribute as the main site) ---------------
  const themeBtn = document.getElementById("theme");
  const paintTheme = () => { themeBtn.textContent = document.documentElement.dataset.theme === "dark" ? "Light" : "Dark"; };
  themeBtn.addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}
    paintTheme();
  });
  paintTheme();

  // ---- live session: type a task, a new card appears ----------------------
  let made = 0;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = prompt.value.trim(); if (!text) return;
    prompt.value = "";
    if (text === "/sessions") { printSessions(); return; }
    const words = text.replace(/^\/\w+\s*/, "").replace(/\s+/g, " ");
    const title = (words.length > 30 ? words.slice(0, 29).trimEnd() + "…" : words).replace(/^./, (ch) => ch.toUpperCase());
    const c = mk("n" + ++made, "playground", title, "feat/" + words.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 22), "run", "now",
      ["Read the code involved", "Make the change", "Run the tests", "Summarise the result"], 0, true, text);
    sessions.push(c); sel = sessions.length - 1; typed = false;
    refresh();
    let k = 0; const t = setInterval(() => { if (c.state === "done" || ++k > 5) return clearInterval(t); advance(c); refresh(); }, 2600);
    document.getElementById("root").scrollTop = 1e6;
  });

  refresh();
})();
