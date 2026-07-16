const artifact = document.body.dataset.artifact;

function show(element) {
  element?.classList.remove("hidden");
  element?.classList.add("fade-in");
}

if (artifact === "causal") {
  const inspector = document.querySelector("#canvas-inspector");
  let selected = null;
  document.querySelectorAll("[data-node]").forEach((node) => {
    node.addEventListener("click", () => {
      document.querySelectorAll(".node.selected").forEach((item) => item.classList.remove("selected"));
      node.classList.add("selected");
      selected = node;
      const [title, body, note] = node.dataset.node.split("|");
      inspector.innerHTML = `<strong>${title}</strong><p>${body}</p><p>${note || "This material can be edited, connected, or forked in place."}</p><div class="canvas-inspector-actions"><button class="secondary" data-action="add-checkpoint">Add checkpoint</button><button class="quiet" data-action="fork-node">Fork selected</button></div>`;
    });
  });
  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "reveal-outcome") { show(document.querySelector("#outcome-node")); show(document.querySelector("#outcome-line")); }
    if (action === "add-checkpoint") show(document.querySelector("#optional-gate"));
    if (action === "fork-node" && selected) {
      const strong = inspector.querySelector("strong");
      if (strong) strong.textContent = `${strong.textContent} · fork ready`;
    }
  });
}

if (artifact === "studio") {
  const variants = {
    current: ["Connect your data", "Choose a source to begin configuring your first workspace.", "Choose a source"],
    proof: ["See your first useful result", "Explore a complete sample now. Connect your workspace when the value is clear.", "Show me the sample"],
    promise: ["Your first answer, in under a minute", "Start with a useful result, then bring in your real workspace when you are ready.", "See the answer"],
  };
  function selectVariant(name) {
    const value = variants[name];
    if (!value) return;
    document.querySelector("#preview-title").textContent = value[0];
    document.querySelector("#preview-copy").textContent = value[1];
    document.querySelector("#preview-button").textContent = value[2];
    document.querySelectorAll("[data-variant]").forEach((item) => item.classList.toggle("active", item.dataset.variant === name));
    document.querySelector("#artifact-status").textContent = `${name === "current" ? "Current product" : "Working variant"} · repository-backed`;
  }
  document.addEventListener("click", (event) => {
    const variant = event.target.closest("[data-variant]")?.dataset.variant;
    if (variant) selectVariant(variant);
    const pin = event.target.closest("[data-copy]");
    if (pin) {
      document.querySelectorAll("[data-copy]").forEach((item) => item.classList.remove("active"));
      pin.classList.add("active");
      document.querySelector("#preview-copy").textContent = pin.dataset.copy;
    }
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "generate-variant") {
      show(document.querySelector("#new-variant-tab")); show(document.querySelector("#new-variant-item")); selectVariant("promise");
    }
    if (action === "stage-version") document.querySelector("#artifact-status").textContent = "Version staged · reversible change ready";
  });
}

if (artifact === "multiverse") {
  let selected = "proof";
  const names = { proof: "Proof before setup", promise: "Promise before setup", concierge: "Product does the setup" };
  document.querySelectorAll(".branch").forEach((branch) => branch.addEventListener("click", () => {
    selected = branch.dataset.branch;
    document.querySelectorAll(".branch").forEach((item) => item.classList.toggle("active", item === branch));
    document.querySelector("#branch-selection").textContent = `${names[selected]} selected · complete product and market state`;
  }));
  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "test-worlds") document.querySelectorAll(".branch-outcome").forEach(show);
    if (action === "compare-worlds") document.querySelector("#branch-selection").textContent = "Comparing product, promise, action, cost, and returned signal across all worlds";
    if (action === "fork-world") document.querySelector("#branch-selection").textContent = `${names[selected]} forked · a new coherent world can now diverge from it`;
  });
}

if (artifact === "ambient") {
  const heat = document.querySelector("#heat-range");
  const labels = ["Off", "Steady", "Full"];
  heat.addEventListener("input", () => { document.querySelector("#heat-label").textContent = labels[Number(heat.value)]; });
  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "ambient-checkpoint") show(document.querySelector("#ambient-checkpoint"));
    if (action === "run-cycle") {
      document.querySelectorAll(".pulse").forEach((pulse, index) => setTimeout(() => pulse.classList.add("running"), index * 140));
      document.querySelector("#ambient-return").textContent = "A stalled trial connected real data";
      show(document.querySelector("#signal-beat"));
      document.querySelector("#cycle-status strong").textContent = "The returned signal will shape the next reversible product change.";
    }
  });
}
