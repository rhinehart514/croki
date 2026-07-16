const model = document.body.dataset.model;
const show = (selector) => {
  const element = document.querySelector(selector);
  element?.classList.remove("hidden");
  element?.classList.add("fade-in");
};

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;

  if (model === "mind") {
    if (action === "mind-run") show("#mind-result");
    if (action === "mind-internals") show("#internal-agents");
  }

  if (model === "cell") {
    if (action === "cell-complete") {
      document.querySelectorAll(".cell-member, .cell-mission").forEach((element) => element.style.opacity = ".18");
      show("#cell-receipt");
      document.querySelector("#cell-status").textContent = "Mission complete · durable learning returned to the venture";
    }
    if (action === "cell-swap") document.querySelector("#cell-status").textContent = "Challenge runtime swapped from Claude to Codex · mission context unchanged";
  }

  if (model === "mandate" && action === "mandate-cycle") show("#next-cycle");

  if (model === "stewards") {
    if (action === "merge-steward") {
      const selected = document.querySelector(".steward.active")?.dataset.steward;
      document.querySelector("#steward-status").textContent = `${selected} merged into the venture · its steward dissolved · lineage retained`;
      document.querySelectorAll(".steward:not(.active)").forEach((element) => element.style.opacity = ".28");
    }
    if (action === "challenge-steward") document.querySelector("#steward-status").textContent = "A second runtime challenged the selected future without creating another durable identity";
  }

  if (model === "delegates") {
    if (action === "delegate-update") document.querySelectorAll(".delegate-change").forEach((element) => { element.classList.remove("hidden"); element.classList.add("fade-in"); });
    if (action === "delegate-artifact") event.target.textContent = "Reconciled variant running";
  }
});

if (model === "stewards") {
  document.querySelectorAll(".steward").forEach((steward) => steward.addEventListener("click", () => {
    document.querySelectorAll(".steward").forEach((item) => item.classList.toggle("active", item === steward));
    document.querySelector("#steward-status").textContent = `${steward.dataset.steward} future selected · steward exists only while this branch lives`;
  }));
}
