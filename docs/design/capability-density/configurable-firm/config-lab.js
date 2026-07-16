const approach = document.body.dataset.approach;

const show = (selector) => {
  const element = document.querySelector(selector);
  element?.classList.remove("hidden");
  element?.classList.add("fade-in");
};

const firmFiles = {
  employees: `<span class="comment"># firm.drover · readable, local, forkable</span>
<span class="key">presentation:</span> <span class="value">employee-team</span>
<span class="key">outcome:</span> increase first-value activation

<span class="key">agents:</span>
  - <span class="key">name:</span> Product Builder
    <span class="key">runtime:</span> codex
    <span class="key">capabilities:</span> [repository, worktree, tests]
    <span class="key">memory:</span> venture
  - <span class="key">name:</span> Evidence Lead
    <span class="key">runtime:</span> claude
    <span class="key">capabilities:</span> [research, analytics]
  - <span class="key">name:</span> Lifecycle Operator
    <span class="key">runtime:</span> claude
    <span class="key">capabilities:</span> [email, outcomes]

<span class="key">coordination:</span> self-organize
<span class="key">authority:</span>
  repository_changes: allow
  customer_contact: ask
  spend_under_20_usd: allow
<span class="key">evaluation:</span> observed activation`,
  teammates: `<span class="comment"># same kernel, relational presentation</span>
<span class="key">presentation:</span> <span class="value">named-teammates</span>
<span class="key">outcome:</span> increase first-value activation

<span class="key">agents:</span>
  - <span class="key">name:</span> Yara
    <span class="key">relationship:</span> persistent teammate
    <span class="key">runtime:</span> codex
    <span class="key">capabilities:</span> [repository, worktree, tests]
  - <span class="key">name:</span> Theo
    <span class="key">relationship:</span> persistent teammate
    <span class="key">runtime:</span> claude
    <span class="key">capabilities:</span> [research, analytics, email]

<span class="key">memory:</span> venture-and-personal
<span class="key">coordination:</span> open
<span class="key">authority:</span>
  repository_changes: allow
  customer_contact: ask
<span class="key">evaluation:</span> observed activation`,
  direct: `<span class="comment"># no fictional organization required</span>
<span class="key">presentation:</span> <span class="value">direct-runtimes</span>
<span class="key">outcome:</span> increase first-value activation

<span class="key">agents:</span>
  - <span class="key">runtime:</span> codex
    <span class="key">instruction:</span> build the strongest product change
    <span class="key">capabilities:</span> [repository, worktree, tests]
  - <span class="key">runtime:</span> claude
    <span class="key">instruction:</span> verify evidence and challenge the change
    <span class="key">capabilities:</span> [research, analytics]

<span class="key">memory:</span> venture
<span class="key">coordination:</span> codex_then_claude
<span class="key">authority:</span>
  repository_changes: allow
  customer_contact: deny
<span class="key">evaluation:</span> observed activation`,
};

const firmOutputs = {
  employees: {
    buildLabel: "Codex · Product Builder",
    buildCopy: "Sample-first onboarding implemented in an isolated worktree; tests pass.",
    checkLabel: "Claude · Evidence Lead",
    checkCopy: "Repository and activation evidence support removing five setup choices.",
    actionLabel: "Lifecycle Operator · configured authority",
    actionCopy: "Reactivation message is staged because customer contact is set to ask.",
    result: "One stalled trial connected real data after seeing the sample. Configuration, runtime receipts, diff, message, and outcome remain joined.",
  },
  teammates: {
    buildLabel: "Yara · Codex",
    buildCopy: "Sample-first onboarding implemented using retained product lessons; tests pass.",
    checkLabel: "Theo · Claude",
    checkCopy: "Prior venture lessons were challenged against this venture’s evidence before use.",
    actionLabel: "Theo · configured authority",
    actionCopy: "Reactivation message is staged because customer contact is set to ask.",
    result: "One stalled trial connected real data. The outcome joins the work while Yara and Theo retain the configured personal and venture memory.",
  },
  direct: {
    buildLabel: "Codex · direct runtime",
    buildCopy: "Sample-first onboarding implemented in an isolated worktree; tests pass.",
    checkLabel: "Claude · direct runtime",
    checkCopy: "The implementation survived an independent evidence and product challenge.",
    actionLabel: "Active authority",
    actionCopy: "Customer contact is unavailable, so no synthetic operator or staged message appears.",
    result: "The product change is ready for release with Codex and Claude receipts. This configuration must learn from in-product activation because it cannot contact trials.",
  },
};

const evolutionResults = {
  "employee-cell": "The employee cell persists. Its sample-first product change becomes venture truth; the other configurations remain forkable rather than being flattened into generic agent memory.",
  "direct-model-pair": "The direct model pair persists. Its simpler organization remains explicit, while the employee cell’s customer-contact capability is available as a separate config diff rather than silently merged.",
  "persistent-teammates": "The persistent teammate firm survives as the base. Its relational continuity remains configured, while unproven delivery cost stays visible instead of being converted into confidence.",
};

function renderFirmOutput(mode) {
  const output = firmOutputs[mode];
  document.querySelector("#run-build-label").textContent = output.buildLabel;
  document.querySelector("#run-build-copy").textContent = output.buildCopy;
  document.querySelector("#run-check-label").textContent = output.checkLabel;
  document.querySelector("#run-check-copy").textContent = output.checkCopy;
  document.querySelector("#run-action-label").textContent = output.actionLabel;
  document.querySelector("#run-action-copy").textContent = output.actionCopy;
  document.querySelector("#file-result-copy").textContent = output.result;
}

document.addEventListener("click", (event) => {
  const actionElement = event.target.closest("[data-action]");
  const action = actionElement?.dataset.action;
  if (!action) return;

  if (approach === "file") {
    if (action === "file-mode") {
      document.querySelectorAll("[data-action='file-mode']").forEach((button) => button.classList.toggle("active", button === actionElement));
      document.querySelector("#manifest").innerHTML = firmFiles[actionElement.dataset.mode];
      document.querySelector("#file-shape").textContent = actionElement.textContent;
      renderFirmOutput(actionElement.dataset.mode);
    }
    if (action === "file-run") show("#file-result");
  }

  if (approach === "compiler") {
    if (action === "compile") {
      show("#compiler-response");
      document.querySelectorAll(".diff.hidden").forEach((element) => show(`#${element.id}`));
      show("#compiled-actions");
    }
    if (action === "compiler-run") show("#compiler-result");
  }

  if (approach === "arrangement") {
    if (action === "attach") {
      document.querySelector("#contact-capability").classList.add("attached");
      document.querySelector("#contact-edge").classList.add("active");
      actionElement.textContent = "Customer contact attached";
    }
    if (action === "arr-run") show("#arr-result");
  }

  if (approach === "evolution") {
    if (action === "observe") document.querySelectorAll(".branch-signal").forEach((element) => show(`#${element.id}`));
    if (action === "merge") {
      const selected = document.querySelector(".config-branch.selected")?.dataset.branch ?? "employee-cell";
      document.querySelector("#evolution-status").textContent = `${selected} selected as the base · any useful traits from other firms remain available as a config diff`;
      document.querySelector("#merge-result-copy").textContent = evolutionResults[selected];
      show("#merge-result");
    }
  }
});

if (approach === "evolution") {
  document.querySelectorAll(".config-branch").forEach((branch) => branch.addEventListener("click", () => {
    document.querySelectorAll(".config-branch").forEach((item) => item.classList.toggle("selected", item === branch));
    document.querySelector("#evolution-status").textContent = `${branch.dataset.branch} selected · the founder controls what outcome the firm is optimized against`;
  }));
}

if (approach === "synthesis") {
  const stream = document.querySelector("#chat-stream");
  const reveal = (...selectors) => selectors.forEach((selector) => show(selector));
  const hide = (...selectors) => selectors.forEach((selector) => document.querySelector(selector)?.classList.add("hidden"));
  const scrollChat = () => { stream.scrollTop = stream.scrollHeight; };

  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "synthesis-apply") {
      hide("#initial-proposal", "#general-agent", "#legacy-edge");
      reveal("#applied-message", "#builder-node", "#evidence-node", "#lifecycle-node", "#replay-node", "#contact-node", "#builder-edge", "#evidence-edge", "#lifecycle-edge", "#builder-resource-edge", "#contact-edge-live");
      document.querySelector("#config-version").textContent = "Configuration v8 · operating locally";
      scrollChat();
    }
    if (action === "synthesis-run") {
      reveal("#work-message", "#product-output", "#verification-output", "#reactivation-output");
      scrollChat();
    }
    if (action === "canvas-propose") {
      reveal("#canvas-proposal", "#replay-edge");
      document.querySelector("#chat-focus").textContent = "Focused: Session replay";
      scrollChat();
    }
    if (action === "canvas-apply") {
      hide("#canvas-proposal");
      document.querySelector("#replay-node").classList.remove("available");
      document.querySelector("#replay-node").classList.add("attached");
      document.querySelector("#replay-node small").textContent = "Configured capability";
      document.querySelector("#replay-node span").textContent = "Evidence Lead · read only";
      document.querySelector("#replay-edge").classList.remove("pending");
      document.querySelector("#replay-edge").classList.add("live");
      document.querySelector("#config-version").textContent = "Configuration v9 · operating locally";
      scrollChat();
    }
    if (action === "composer-send") {
      const composer = document.querySelector("#firm-composer");
      document.querySelector("#composer-copy").textContent = composer.value;
      reveal("#composer-message");
      composer.value = "";
      scrollChat();
    }
  });

  document.querySelectorAll(".firm-node[data-focus]").forEach((node) => node.addEventListener("click", () => {
    document.querySelectorAll(".firm-node").forEach((item) => item.classList.toggle("focused", item === node));
    document.querySelector("#chat-focus").textContent = `Focused: ${node.dataset.focus}`;
    document.querySelector("#firm-composer").placeholder = `Direct or configure ${node.dataset.focus}`;
  }));
}
