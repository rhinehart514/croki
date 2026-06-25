/* Live component demos — rendered from the real @gtm-ide/design-system bundle
   (window.GtmIde). Each demo mounts into a #demo-* node in the styleguide page. */
(function () {
  const G = window.GtmIde;
  const h = React.createElement;
  const {
    Toolbar, Brand, ToolbarDivider, ToolbarSpacer,
    Button, Badge, SegmentedTabs, StatusDot, SectionHeading,
    Input, Textarea, Card, CardHeader, CardTitle, CardDescription, CardContent,
    CitationCard, ProspectCard, WorkflowNode,
  } = G;

  /* ── Icons (the same glyph set the package ships in its previews) ───────── */
  const svg = (children, props) => h("svg", Object.assign({ key: "ic", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 }, props), children);
  const P = (d, k) => h("path", { d, key: k });
  const I = {
    source:   svg([h("circle", { cx: 11, cy: 11, r: 7, key: "c" }), P("m21 21-4.3-4.3", "p")]),
    enrich:   svg([h("ellipse", { cx: 12, cy: 5, rx: 8, ry: 3, key: "e" }), P("M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5", "p")]),
    filter:   svg(P("M3 4h18l-7 8v6l-4 2v-8z")),
    generate: svg(P("m12 2 2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z"), { fill: "currentColor", stroke: "none" }),
    gate:     svg([h("rect", { x: 4, y: 11, width: 16, height: 9, rx: 2, key: "r" }), P("M8 11V7a4 4 0 0 1 8 0v4", "p")]),
    execute:  svg(P("M8 5v14l11-7z"), { fill: "currentColor", stroke: "none" }),
    measure:  svg([P("M3 3v18h18", "a"), P("m7 14 3-3 3 3 5-5", "b")]),
  };
  const Check  = svg(P("M20 6 9 17l-5-5"), { strokeWidth: 3 });
  const File   = svg([P("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "a"), P("M14 2v6h6", "b")]);
  const Mark   = svg(P("M4 7h16M4 12h10M4 17h7"));
  const Build  = svg(P("m7 8-4 4 4 4M17 8l4 4-4 4"));
  const Play   = svg(P("M8 5v14l11-7z"), { fill: "currentColor", stroke: "none" });
  const Gauge  = svg([P("M12 13l4-3", "a"), h("path", { d: "M5 19a9 9 0 1 1 14 0", key: "b" })]);
  const Plus   = svg([P("M12 5v14", "a"), P("M5 12h14", "b")]);
  const row    = { display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" };

  /* ── Demo definitions ───────────────────────────────────────────────────── */
  function Toolbar_() {
    return h(Toolbar, null,
      h(Brand, { mark: Mark }, "GTM IDE"),
      h(ToolbarDivider),
      h("span", { style: { fontSize: 13, fontWeight: 620, color: "var(--ink-2)" } }, "Buffalo-Projects"),
      h("span", { style: { color: "var(--faint)", fontSize: 13 } }, "/"),
      h("span", { style: { fontSize: 13, fontWeight: 620, color: "var(--ink)" } }, "outreach-graph"),
      h(ToolbarSpacer),
      h(Badge, { tone: "gap", caps: true }, "1 gate waiting"),
      h(Button, { variant: "ghost", size: "icon", "aria-label": "Add" }, Plus),
      h(Button, { variant: "secondary", size: "sm" }, "Preview"),
      h(Button, { size: "sm" }, "Deploy"),
    );
  }

  function Buttons() {
    const set = (size) => h("div", { style: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" } },
      h(Button, { variant: "primary", size }, "Deploy"),
      h(Button, { variant: "secondary", size }, "Preview"),
      h(Button, { variant: "outline", size }, "Connect"),
      h(Button, { variant: "ghost", size }, "Cancel"),
    );
    return h("div", { style: { display: "grid", gap: 14 } },
      set("md"),
      set("sm"),
      h("div", { style: { display: "flex", gap: 12, alignItems: "center" } },
        h(Button, { size: "icon", "aria-label": "Add" }, Plus),
        h(Button, { variant: "secondary", size: "icon", "aria-label": "Run" }, Play),
        h(Button, { variant: "outline", size: "icon", "aria-label": "Build" }, Build),
        h(Button, { disabled: true }, "Disabled"),
      ),
    );
  }

  function Badges() {
    const ic = (children, sw) => h("svg", { viewBox: "0 0 24 24", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: sw || 1.8, strokeLinecap: "round", strokeLinejoin: "round" }, children);
    const Film  = ic([h("rect", { x: 3, y: 4, width: 18, height: 16, rx: 2, key: "r" }), P("M3 9h18M3 15h18M8 4v16M16 4v16", "p")]);
    const Globe = ic([h("circle", { cx: 12, cy: 12, r: 9, key: "c" }), P("M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18", "p")]);
    const Lock  = ic([h("rect", { x: 5, y: 11, width: 14, height: 9, rx: 2, key: "r" }), P("M8 11V8a4 4 0 0 1 8 0v3", "p")]);
    const Clock = ic([h("circle", { cx: 12, cy: 12, r: 9, key: "c" }), P("M12 7v5l3 2", "p")]);
    const Spark = h("svg", { viewBox: "0 0 24 24", width: 13, height: 13, fill: "currentColor" }, P("M12 2l2.2 7.1L21 12l-6.8 2.9L12 22l-2.2-7.1L3 12l6.8-2.9z"));
    const Play2 = h("svg", { viewBox: "0 0 24 24", width: 12, height: 12, fill: "currentColor" }, P("M8 5v14l11-7z"));

    const chip = (icon, tone, key) => h("span", { key, title: key, style: { width: 26, height: 26, borderRadius: 7, display: "grid", placeItems: "center", color: tone, background: "color-mix(in srgb, " + tone + " 14%, rgba(255,255,255,0.72))", border: "1px solid color-mix(in srgb, " + tone + " 24%, transparent)" } }, icon);
    const avatar = h("span", { key: "av", style: { width: 26, height: 26, borderRadius: 7, display: "grid", placeItems: "center", background: "var(--st-ink)", color: "#fff", fontSize: 12, fontWeight: 700 } }, "A");
    const pill = (icon, label, key, accent) => h("span", { key, style: { display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 11px", borderRadius: 999, fontSize: 12, fontWeight: 600, color: accent || "var(--st-ink-2)", background: "rgba(255,255,255,0.62)", border: "1px solid var(--st-line-2)" } }, icon, label);
    const cap = { fontFamily: "var(--st-mono)", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--st-muted)", marginBottom: 12 };
    const r = { display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" };

    return h("div", { style: { display: "grid", gap: 24 } },
      h("div", null,
        h("div", { style: cap }, "Icon chips"),
        h("div", { style: r },
          chip(Film, "var(--proven)", "video"),
          chip(Globe, "var(--link)", "published"),
          chip(Lock, "var(--muted)", "private"),
          chip(Spark, "var(--gap)", "ai"),
          avatar,
        ),
      ),
      h("div", null,
        h("div", { style: cap }, "Metadata pills"),
        h("div", { style: r },
          pill(Clock, "0:41", "dur"),
          pill(Spark, "1", "count"),
          pill(Play2, "Template", "tmpl"),
          pill(h("span", { style: { width: 7, height: 7, borderRadius: "50%", background: "var(--proven)", display: "inline-block" } }), "Published", "pub", "var(--proven)"),
        ),
      ),
    );
  }

  function Tabs() {
    const A = () => {
      const [v, setV] = React.useState("run");
      return h(SegmentedTabs, {
        value: v, onValueChange: setV,
        items: [{ value: "build", label: "Build" }, { value: "run", label: "Run" }, { value: "measure", label: "Measure" }],
      });
    };
    const B = () => {
      const [v, setV] = React.useState("build");
      return h(SegmentedTabs, {
        value: v, onValueChange: setV,
        items: [
          { value: "build", label: "Build", icon: Build },
          { value: "run", label: "Run", icon: Play },
          { value: "measure", label: "Measure", icon: Gauge },
        ],
      });
    };
    return h("div", { style: { display: "flex", gap: 18, flexWrap: "wrap" } }, h(A), h(B));
  }

  function Dots() {
    const tones = [["proven", "Proven / ready"], ["gap", "Gap"], ["danger", "Failing"], ["missing", "Missing"], ["blind", "Blind"]];
    return h("div", { style: { display: "grid", gap: 9 } },
      tones.map(([t, l]) => h("div", { key: t, style: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-2)" } },
        h(StatusDot, { tone: t }), l)));
  }

  function Headings() {
    return h("div", { style: { display: "grid", gap: 14 } },
      h(SectionHeading, null, "Outreach system"),
      h(SectionHeading, { icon: Build }, "Build graph"),
      h(SectionHeading, { icon: Gauge }, "Measurement"),
    );
  }

  function Inputs() {
    return h("div", { style: { display: "grid", gap: 12, maxWidth: 420 } },
      h(Input, { placeholder: "Account name…" }),
      h(Input, { mono: true, defaultValue: "agent:gtm-signal-github" }),
      h(Input, { disabled: true, defaultValue: "Locked" }),
      h(Textarea, { rows: 3, placeholder: "Opener prompt…" }),
      h(Textarea, { mono: true, rows: 3, defaultValue: "status: 'blind', // no measurement source" }),
    );
  }

  function Cards() {
    const ic = (children, sw) => h("svg", { viewBox: "0 0 24 24", width: 13, height: 13, fill: "none", stroke: "currentColor", strokeWidth: sw || 1.8, strokeLinecap: "round", strokeLinejoin: "round" }, children);
    const Film  = ic([h("rect", { x: 3, y: 4, width: 18, height: 16, rx: 2, key: "r" }), P("M3 9h18M3 15h18M8 4v16M16 4v16", "p")]);
    const Globe = ic([h("circle", { cx: 12, cy: 12, r: 9, key: "c" }), P("M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18", "p")]);
    const Clock = ic([h("circle", { cx: 12, cy: 12, r: 9, key: "c" }), P("M12 7v5l3 2", "p")]);
    const Spark = h("svg", { viewBox: "0 0 24 24", width: 12, height: 12, fill: "currentColor" }, P("M12 2l2.2 7.1L21 12l-6.8 2.9L12 22l-2.2-7.1L3 12l6.8-2.9z"));
    const Play2 = h("svg", { viewBox: "0 0 24 24", width: 11, height: 11, fill: "currentColor" }, P("M8 5v14l11-7z"));

    const chip = (icon, tone, key) => h("span", { key, style: { width: 24, height: 24, borderRadius: 6, display: "grid", placeItems: "center", color: tone, background: "color-mix(in srgb, " + tone + " 14%, rgba(255,255,255,0.72))", border: "1px solid color-mix(in srgb, " + tone + " 24%, transparent)", flex: "0 0 auto" } }, icon);
    const avatar = h("span", { key: "av", style: { width: 24, height: 24, borderRadius: 6, display: "grid", placeItems: "center", background: "var(--st-ink)", color: "#fff", fontSize: 11, fontWeight: 700, flex: "0 0 auto" } }, "A");
    const pill = (icon, label, key) => h("span", { key, style: { display: "inline-flex", alignItems: "center", gap: 5, height: 24, padding: "0 9px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, color: "var(--st-ink-2)", background: "rgba(255,255,255,0.62)", border: "1px solid var(--st-line-2)", flex: "0 0 auto" } }, icon, label);

    const card = (thumb, title, edited, footer, key) => h("div", { key, style: { display: "flex", flexDirection: "column", background: "var(--st-glass)", WebkitBackdropFilter: "blur(22px) saturate(1.6)", backdropFilter: "blur(22px) saturate(1.6)", border: "1px solid var(--st-glass-brd)", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 14px 34px -18px rgba(20,20,25,0.28), inset 0 1px 0 rgba(255,255,255,0.7)" } },
      thumb,
      h("div", { style: { padding: "13px 14px 14px", display: "grid", gap: 4 } },
        h("div", { style: { fontSize: 15, fontWeight: 640, letterSpacing: "-0.015em", color: "var(--st-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, title),
        h("div", { style: { fontSize: 12.5, color: "var(--st-muted)" } }, edited),
        h("div", { style: { display: "flex", gap: 8, alignItems: "center", marginTop: 10 } }, footer),
      ),
    );

    const thumbBase = { height: 154, display: "grid", placeItems: "center", padding: 18, textAlign: "center" };
    const t1 = h("div", { style: Object.assign({}, thumbBase, { background: "linear-gradient(135deg,#26262d,#0c0c0f)" }) },
      h("div", { style: { color: "#f4f4f5", fontSize: 16, fontWeight: 600, letterSpacing: "-0.02em" } }, "Customer context is everywhere."));
    const t2 = h("div", { style: Object.assign({}, thumbBase, { background: "linear-gradient(135deg,#aec6f0,#cbbdf0)", alignContent: "center", gap: 6, display: "grid" }) },
      h("div", { style: { fontFamily: "var(--st-mono)", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(28,28,30,0.6)" } }, "Template"),
      h("div", { style: { color: "var(--st-ink)", fontSize: 20, fontWeight: 660, letterSpacing: "-0.025em" } }, "New features"));
    const t3 = h("div", { style: Object.assign({}, thumbBase, { background: "#f1f0ee" }) },
      h("div", { style: { width: "76%", display: "grid", gap: 7 } },
        h("div", { style: { height: 9, width: "60%", borderRadius: 4, background: "#d9d8d4" } }),
        h("div", { style: { height: 9, width: "100%", borderRadius: 4, background: "#e4e3df" } }),
        h("div", { style: { height: 9, width: "100%", borderRadius: 4, background: "#e4e3df" } }),
        h("div", { style: { height: 9, width: "44%", borderRadius: 4, background: "#e4e3df" } }),
      ));

    return h("div", { style: { display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(248px,1fr))" } },
      card(t1, "Announcing CRM Feature", "Edited 11 minutes ago", [chip(Film, "var(--proven)", "f"), avatar, pill(Clock, "0:41", "d")], "c1"),
      card(t2, "Create a great flow", "Edited 5 days ago", [chip(Play2, "var(--link)", "p"), pill(Play2, "Template", "t"), avatar], "c2"),
      card(t3, "Mobbin Demo", "Edited 1 day ago", [chip(Globe, "var(--link)", "g"), avatar, pill(Spark, "1", "s")], "c3"),
    );
  }

  function Citations() {
    return h("div", { style: { display: "grid", gap: 8, maxWidth: 380 } },
      h(CitationCard, { icon: File, path: "brain/src/scan.mjs:42", code: "const win = findWinEvent(repo);\n// project_created — attribution source: none" }),
      h(CitationCard, { icon: File, path: "brain/src/program-store.mjs:88", code: "status: 'blind', // no measurement source" }),
    );
  }

  function Prospects() {
    return h("div", { style: { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" } },
      h(ProspectCard, {
        name: "Northwind Labs", score: "92", scoreTone: "proven",
        summary: "Series A dev-tools company; added a competitor's SDK 6 days ago and is hiring its first GTM engineer.",
        draftLabel: "Opener draft",
        draft: "Saw Northwind shipped the new SDK last week — most teams hit attribution gaps right after. Worth a look?",
      }),
      h(ProspectCard, { name: "Acme Co", score: "61", scoreTone: "gap", summary: "Partial fit; no recent buying signal." }),
    );
  }

  function Nodes() {
    const LINE = "#c7c6c2", DOT = "#b3b2ae";
    const Gear = h("svg", { viewBox: "0 0 24 24", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" },
      h("circle", { cx: 12, cy: 12, r: 3, key: "a" }),
      h("path", { d: "M12 2.5v3M12 18.5v3M4.5 4.5l2 2M17.5 17.5l2 2M2.5 12h3M18.5 12h3M4.5 19.5l2-2M17.5 6.5l2-2", key: "b" }));
    const coin = h("span", { key: "co", style: { width: 13, height: 13, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%, #ffe9a8, #e3b352)", border: "1px solid #cf9b3a", display: "inline-block", flex: "0 0 auto" } });

    function NodeCard(p) {
      const tint = "color-mix(in srgb, " + p.accent + " 15%, rgba(255,255,255,0.7))";
      const tintBrd = "color-mix(in srgb, " + p.accent + " 24%, transparent)";
      const metaRow = (label, val) => h("div", { key: label, style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 } },
        h("span", { style: { color: "var(--st-muted)" } }, label),
        val);
      const onVal  = h("span", { style: { color: "var(--link)", fontWeight: 600 } }, "Enabled");
      const offVal = h("span", { style: { color: "var(--danger)", fontWeight: 600 } }, "Disabled");
      const costVal = p.cost === "Free"
        ? h("span", { style: { color: "var(--st-faint)" } }, "Free")
        : h("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, color: "var(--st-ink-2)", fontWeight: 600 } }, p.cost, coin);
      return h("div", {
        style: {
          width: 248, minHeight: 128, display: "flex", flexDirection: "column",
          background: "var(--st-glass)", WebkitBackdropFilter: "blur(22px) saturate(1.6)", backdropFilter: "blur(22px) saturate(1.6)",
          border: "1px solid " + (p.selected ? "var(--st-ink)" : "var(--st-glass-brd)"), borderRadius: 14, overflow: "hidden",
          boxShadow: p.selected
            ? "0 0 0 3px rgba(28,28,30,0.13), 0 18px 40px -18px rgba(20,20,25,0.38), inset 0 1px 0 rgba(255,255,255,0.8)"
            : "0 1px 2px rgba(0,0,0,0.04), 0 14px 34px -18px rgba(20,20,25,0.30), inset 0 1px 0 rgba(255,255,255,0.72)",
        },
      },
        h("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "11px 13px" } },
          h("span", { style: { width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", color: p.accent, background: tint, border: "1px solid " + tintBrd, flex: "0 0 auto" } }, p.icon),
          h("span", { style: { flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 620, letterSpacing: "-0.01em", color: "var(--st-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, p.title),
          h("span", { style: { color: "var(--st-faint)", display: "grid", flex: "0 0 auto" } }, Gear),
        ),
        h("div", { style: { height: 1, background: "var(--st-line)" } }),
        h("div", { style: { padding: "10px 13px 12px", display: "grid", gap: 7 } },
          metaRow("Auto-Run", p.autoRun === false ? offVal : onVal),
          metaRow("Cost", costVal),
          p.fields != null ? metaRow("Mapped fields", h("span", { style: { color: "var(--st-ink-2)", fontWeight: 600 } }, p.fields)) : null,
        ),
      );
    }

    const at = (left, top, p) => h("div", { key: "n" + left + "-" + top, style: { position: "absolute", left, top, width: 248 } }, h(NodeCard, p));
    const curve = (x1, y1, x2, y2) => { const dx = Math.max(46, (x2 - x1) * 0.5); return "M" + x1 + "," + y1 + " C" + (x1 + dx) + "," + y1 + " " + (x2 - dx) + "," + y2 + " " + x2 + "," + y2; };
    const conns = [[256, 278, 336, 94], [256, 278, 336, 278], [256, 278, 336, 462], [584, 94, 664, 184], [584, 462, 664, 184], [584, 278, 664, 424]];
    const ports = [[256, 278], [584, 94], [584, 278], [584, 462], [336, 94], [336, 278], [336, 462], [664, 184], [664, 424]];

    const graph = h("div", { style: { overflowX: "auto", paddingBottom: 4 } },
      h("div", { style: { position: "relative", width: 920, height: 556, margin: "0 auto" } },
        h("svg", { width: 920, height: 556, style: { position: "absolute", inset: 0, pointerEvents: "none" }, fill: "none" },
          conns.map((c, i) => h("path", { key: "p" + i, d: curve(c[0], c[1], c[2], c[3]), stroke: LINE, strokeWidth: 1.6, strokeLinecap: "round" })),
          ports.map((p, i) => h("circle", { key: "c" + i, cx: p[0], cy: p[1], r: 3, fill: "#fff", stroke: DOT, strokeWidth: 1.4 })),
        ),
        at(8, 214,  { accent: "var(--cat-source)",   icon: I.source,   title: "Imported Accounts", autoRun: true,  cost: "Free", fields: 9 }),
        at(336, 30, { accent: "var(--cat-source)",   icon: I.source,   title: "Scrape Website",    autoRun: true,  cost: "1",    fields: 4 }),
        at(336, 214,{ accent: "var(--cat-source)",   icon: I.source,   title: "People Search",     autoRun: true,  cost: "Free", fields: 2 }),
        at(336, 398,{ accent: "var(--cat-enrich)",   icon: I.enrich,   title: "Find Tech Stack",   autoRun: true,  cost: "1",    fields: 1 }),
        at(664, 120,{ accent: "var(--cat-filter)",   icon: I.filter,   title: "ICP Classification",autoRun: true,  cost: "1",    fields: 1 }),
        at(664, 360,{ accent: "var(--cat-generate)", icon: I.generate, title: "Draft Opener",      autoRun: false, cost: "1",    fields: 1, selected: true }),
      ),
    );
    return graph;
  }

  function Chat() {
    const ic = (d, o) => h("svg", Object.assign({ viewBox: "0 0 24 24", width: 16, height: 16, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }, o || {}), (Array.isArray(d) ? d : [d]).map((x, i) => h("path", { d: x, key: i })));
    const Panel = ic(["M3 4.5h18a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z", "M9 4.5v15"]);
    const Pen   = ic(["M4 20h4L19 9l-4-4L4 16z", "M14 6l4 4"]);
    const Chev  = ic("M9 6l6 6-6 6");
    const Copy  = h("svg", { viewBox: "0 0 24 24", width: 15, height: 15, fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" }, h("rect", { x: 9, y: 9, width: 11, height: 11, rx: 2, key: "r" }), h("path", { d: "M5 15V5a2 2 0 0 1 2-2h10", key: "p" }));
    const Refr  = ic(["M21 12a9 9 0 1 1-2.6-6.3", "M21 4v4h-4"]);
    const Mic   = h("svg", { viewBox: "0 0 24 24", width: 17, height: 17, fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" }, h("rect", { x: 9, y: 3, width: 6, height: 11, rx: 3, key: "r" }), h("path", { d: "M5 11a7 7 0 0 0 14 0M12 18v3", key: "p" }));
    const Send  = ic(["M12 19V5", "M6 11l6-6 6 6"], { strokeWidth: 2.1 });
    const Star  = h("svg", { viewBox: "0 0 24 24", width: 14, height: 14, fill: "currentColor" }, P("M12 2l2.2 7.1L21 12l-6.8 2.9L12 22l-2.2-7.1L3 12l6.8-2.9z"));
    const Doc   = ic(["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M8 13h8M8 17h6"], { width: 15, height: 15 });

    const iconBtn = (icon, key) => h("button", { key, style: { width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", border: "1px solid transparent", background: "transparent", color: "var(--st-ink-2)", cursor: "pointer" } }, icon);

    const header = h("div", { style: { display: "flex", alignItems: "center", gap: 4, padding: "10px 12px", borderBottom: "1px solid var(--st-line)" } },
      iconBtn(Panel, "p"), iconBtn(Pen, "n"),
      h("span", { style: { marginLeft: 6, fontSize: 13.5, fontWeight: 600, color: "var(--st-ink)" } }, "Outreach assistant"),
    );

    const pdfBadge = h("span", { style: { width: 34, height: 34, borderRadius: 8, display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--danger) 14%, rgba(255,255,255,0.7))", color: "var(--danger)", flex: "0 0 auto" } }, Doc);
    const attach = h("div", { style: { alignSelf: "flex-start", maxWidth: 260, background: "rgba(255,255,255,0.55)", border: "1px solid var(--st-glass-brd)", borderRadius: 14, padding: 12, display: "grid", gap: 10, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)" } },
      h("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, pdfBadge,
        h("div", { style: { minWidth: 0 } },
          h("div", { style: { fontSize: 13, fontWeight: 620, color: "var(--st-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, "Northwind-account-research.pdf"),
          h("div", { style: { fontSize: 12, color: "var(--st-muted)" } }, "PDF document"),
        ),
      ),
      h("div", { style: { background: "#fff", border: "1px solid var(--st-line)", borderRadius: 8, padding: 12, display: "grid", gap: 6 } },
        h("div", { style: { height: 7, width: "55%", borderRadius: 3, background: "#dededa" } }),
        [88, 100, 100, 70, 94].map((w, i) => h("div", { key: i, style: { height: 6, width: w + "%", borderRadius: 3, background: "#ececea" } })),
      ),
    );

    const userMsg = h("div", { style: { alignSelf: "stretch", background: "rgba(0,0,0,0.045)", border: "1px solid var(--st-line)", borderRadius: 14, padding: "13px 15px", fontSize: 14, lineHeight: 1.55, color: "var(--st-ink)" } },
      "You are a GTM engineer helping me compose outreach. First, summarize the buying signals from this account in plain English. ",
      h("span", { style: { color: "var(--st-faint)" } }, "Then group them into 3–5 themes. After that…"),
      h("div", { style: { marginTop: 6, fontSize: 13, color: "var(--st-ink-2)", fontWeight: 600, cursor: "pointer" } }, "Show more"),
    );

    const toolChip = h("div", { style: { alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 11px", borderRadius: 10, background: "rgba(255,255,255,0.55)", border: "1px solid var(--st-glass-brd)", fontSize: 12.5, color: "var(--st-ink-2)" } },
      h("span", { style: { color: "var(--danger)", display: "grid" } }, Doc),
      h("span", null, "Read ", h("b", { style: { color: "var(--st-ink)", fontWeight: 600 } }, "“Northwind-account-research.pdf”")),
      h("span", { style: { color: "var(--st-faint)", display: "grid" } }, Chev),
    );
    const docRef = h("div", { style: { alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 9, padding: "9px 12px", borderRadius: 10, background: "rgba(255,255,255,0.45)", border: "1px solid var(--st-line-2)", fontSize: 13 } },
      h("span", { style: { color: "var(--cat-generate)", display: "grid" } }, Doc),
      h("span", { style: { fontWeight: 600, color: "var(--st-ink)" } }, "Northwind Outreach Brief"),
    );
    const aiText = h("div", { style: { fontSize: 14, lineHeight: 1.6, color: "var(--st-ink-2)" } },
      "I've drafted a brief with the buying signals, three outreach themes, and a recommended opener grounded in the research. Want me to expand it into a full send sequence next?");
    const aiActions = h("div", { style: { display: "flex", gap: 4, color: "var(--st-faint)" } },
      iconBtn(Copy, "c"),
      h("button", { style: { display: "inline-flex", alignItems: "center", gap: 2, height: 30, padding: "0 8px", borderRadius: 8, border: "1px solid transparent", background: "transparent", color: "var(--st-faint)", cursor: "pointer" } }, Refr, h("span", { style: { display: "grid", transform: "rotate(90deg)" } }, Chev)),
    );
    const aiAvatar = h("span", { style: { width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--st-ink)", color: "#fff", flex: "0 0 auto" } }, Star);
    const assistant = h("div", { style: { display: "flex", gap: 10, alignItems: "flex-start" } },
      aiAvatar,
      h("div", { style: { display: "grid", gap: 10, minWidth: 0, flex: 1 } }, toolChip, docRef, aiText, aiActions),
    );

    const body = h("div", { style: { flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 } },
      attach, userMsg, assistant);

    const canvasPill = h("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px", borderRadius: 999, background: "color-mix(in srgb, var(--link) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--link) 30%, transparent)", color: "var(--link)", fontSize: 13, fontWeight: 600 } }, h("span", { style: { display: "grid" } }, Pen), "Canvas");
    const modelPill = h("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 11px", borderRadius: 999, border: "1px solid var(--st-line-2)", background: "rgba(255,255,255,0.5)", color: "var(--st-ink-2)", fontSize: 13, fontWeight: 500 } }, h("span", { style: { color: "var(--st-ink)", display: "grid" } }, Star), "Sonnet 4.5", h("span", { style: { color: "var(--st-faint)", display: "grid" } }, ic("M6 9l6 6 6-6", { width: 13, height: 13 })));
    const plusBtn = h("span", { style: { width: 30, height: 30, borderRadius: "50%", display: "grid", placeItems: "center", border: "1px solid var(--st-line-2)", color: "var(--st-ink-2)", background: "rgba(255,255,255,0.5)" } }, ic(["M12 5v14", "M5 12h14"], { width: 16, height: 16 }));
    const sendBtn = h("span", { style: { width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--st-ink)", color: "#fff", flex: "0 0 auto" } }, Send);
    const composer = h("div", { style: { borderTop: "1px solid var(--st-line)", padding: 12 } },
      h("div", { style: { borderRadius: 16, border: "1px solid var(--st-line-2)", background: "rgba(255,255,255,0.55)", padding: 12, display: "grid", gap: 12, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)" } },
        h("div", { style: { fontSize: 14.5, color: "var(--st-faint)", padding: "2px 2px" } }, "Ask anything, ", h("b", { style: { color: "var(--st-ink-2)", fontWeight: 600 } }, "@"), " for context and skills"),
        h("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
          plusBtn, canvasPill,
          h("span", { style: { marginLeft: "auto" } }),
          modelPill,
          h("span", { style: { color: "var(--st-ink-2)", display: "grid" } }, Mic),
          sendBtn,
        ),
      ),
    );

    return h("div", { style: { maxWidth: 480, margin: "0 auto", height: 640, display: "flex", flexDirection: "column", background: "var(--st-glass)", WebkitBackdropFilter: "blur(26px) saturate(1.6)", backdropFilter: "blur(26px) saturate(1.6)", border: "1px solid var(--st-glass-brd)", borderRadius: 18, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 24px 60px -26px rgba(20,20,25,0.4), inset 0 1px 0 rgba(255,255,255,0.7)" } },
      header, body, composer);
  }

  const demos = {
    "demo-toolbar": Toolbar_, "demo-buttons": Buttons, "demo-badges": Badges,
    "demo-tabs": Tabs, "demo-dots": Dots, "demo-headings": Headings,
    "demo-inputs": Inputs, "demo-cards": Cards, "demo-citations": Citations,
    "demo-prospects": Prospects, "demo-nodes": Nodes, "demo-chat": Chat,
  };

  Object.entries(demos).forEach(([id, Comp]) => {
    const el = document.getElementById(id);
    if (!el) return;
    try { ReactDOM.createRoot(el).render(h(Comp)); }
    catch (e) { el.textContent = "⚠ " + (e && e.message || e); }
  });
})();
