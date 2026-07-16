const fixtures = {
  buffalo: {
    name: "Buffalo Projects",
    heading: "Buffalo Projects is testing whether useful work begins before identity.",
    intent: "Talented builders find the right people through credible work—not polished profiles.",
    proof: "Repository-bound product truth · 3 intended changes · 1 contradiction",
    needs: "Release the project-drop experience",
    returned: "4 of 6 builders described work before making a profile",
    pressure: "The intake system has proof; referral still has none",
    loop: ["Recent graduate", "Describes the work", "Enters a matched cohort", "Leaves credible proof", "Finds people and opportunity"],
    loopNotes: ["arrives with something to build", "before identity or credentials", "composition is the product center", "work entries compound the record", "proof attracts the next participant"],
    productPressure: ["Missing capability", "Private usefulness before cohort invitation is not yet supported by the product."],
    systems: [
      ["intake", "Builder intake", "captures a real project before a profile"],
      ["work-proof", "Work record + proof", "shared by 2 motions"],
      ["cohort", "Cohort operation", "composes and runs working rooms"],
      ["intelligence", "Intelligence production", "turns work into legible market evidence"],
    ],
    motions: [
      ["graduate", "Active · product-led", "Graduate → project drop → cohort → proof → referral", "Builder intake · Cohort operation · Work record + proof", 1],
      ["intelligence", "Active · relationship-led", "Intelligence → recognition → sponsored cohort → outcomes", "Intelligence production · Work record + proof", 1],
      ["event", "Inactive · unsupported", "Event participant → working room → cohort", "Event activation has no current release or evidence", 0],
    ],
    campaign: "First twenty project drops",
    campaignMeta: "Audience: recent graduates · Objective: qualified work before profile creation",
    bet: "Project drop converts better than profile creation",
    release: "Project-drop experience",
    outcome: "4 of 6 described work first",
    territory: ["Campus distribution door", "Important context; not an operational taxonomy."],
    concepts: [
      ["champions", "Department champions", "Possible human bridge into a sponsored cohort.", false],
      ["referral", "Referral engine", "Maybe visible work proof can create the next participant introduction.", true],
    ],
  },
  denialshield: {
    name: "DenialShield",
    heading: "DenialShield is testing whether prevention can replace consultant-led cleanup.",
    intent: "Dental teams prevent claim denials before submission without becoming insurance experts.",
    proof: "Repository-bound product truth · 2 intended changes · 2 unsupported joins",
    needs: "Release the eligibility-warning pilot",
    returned: "One office prevented 7 coding errors in a reviewed batch",
    pressure: "The consultant channel has evidence; self-serve adoption does not",
    loop: ["Billing coordinator", "Imports a claim batch", "Sees denial risk", "Fixes exact errors", "Submits cleaner claims"],
    loopNotes: ["owns revenue recovery", "from the existing workflow", "before payer submission", "with cited policy evidence", "and compounds prevention data"],
    productPressure: ["Unsupported handoff", "The product cannot yet explain high-risk exceptions without consultant help."],
    systems: [
      ["intake", "Claim intake", "normalizes batches from practice systems"],
      ["work-proof", "Denial evidence", "shared by 2 motions"],
      ["cohort", "Consultant enablement", "turns findings into office action"],
      ["intelligence", "Payer intelligence", "updates cited denial rules"],
    ],
    motions: [
      ["graduate", "Active · consultant-led", "Consultant → batch review → prevented denial → expansion", "Claim intake · Consultant enablement · Denial evidence", 1],
      ["intelligence", "Active · outbound", "Denial benchmark → revenue lead → reviewed batch → pilot", "Payer intelligence · Denial evidence", 1],
      ["event", "Inactive · unsupported", "Self-serve import → warning → corrected claim", "No observed unaided completion yet", 0],
    ],
    campaign: "Ten-office prevention pilot",
    campaignMeta: "Audience: dental revenue leads · Objective: prove preventable loss before a sales call",
    bet: "Exact warnings create action without consultant explanation",
    release: "Eligibility-warning pilot",
    outcome: "7 coding errors prevented",
    territory: ["Practice adoption edge", "Founder language around adoption; not a CRM segment."],
    concepts: [
      ["champions", "Office champion", "A billing coordinator who can carry prevention into the daily workflow.", false],
      ["referral", "Self-serve explanation", "Maybe cited exception explanations can reduce consultant dependence.", true],
    ],
  },
};

let ventureKey = "buffalo";
let altitude = "venture";
let focus = null;
let selectedConcept = null;
const history = [];
const promotedConcepts = new Set();
const createdConcepts = { buffalo: [], denialshield: [] };
const app = document.querySelector(".app");
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function setText(selector, value) { const node = $(selector); if (node) node.textContent = value; }
function conceptsForCurrentVenture() { return [...fixtures[ventureKey].concepts, ...createdConcepts[ventureKey]]; }
function conceptByKey(key) { return conceptsForCurrentVenture().find((concept) => `concept:${concept[0]}` === key); }
function renderConcepts() {
  const f = fixtures[ventureKey];
  setText("#territory-heading", f.territory[0]);
  $("#territory-heading").nextElementSibling.textContent = f.territory[1];
  const positions = [["47%", "20%"], ["72%", "56%"], ["19%", "57%"], ["58%", "68%"]];
  const concepts = conceptsForCurrentVenture();
  $$(".open-territory .open-concept").forEach((node, index) => {
    const concept = concepts[index];
    if (!concept) { node.hidden = true; return; }
    node.hidden = false;
    const key = `concept:${concept[0]}`;
    node.dataset.entity = key;
    node.dataset.statement = concept[2];
    node.style.setProperty("--concept-x", positions[index]?.[0] || "20%");
    node.style.setProperty("--concept-y", positions[index]?.[1] || "58%");
    node.querySelector("small").textContent = promotedConcepts.has(`${ventureKey}:${key}`) ? "Reusable system" : "Open concept";
    node.querySelector("strong").textContent = concept[1];
    node.classList.toggle("promoted", promotedConcepts.has(`${ventureKey}:${key}`));
  });
  for (let index = 2; index < concepts.length; index += 1) {
    if ($(`.open-territory [data-entity="concept:${concepts[index][0]}"]`)) continue;
    const node = document.createElement("button");
    node.type = "button";
    node.className = "open-concept";
    node.dataset.entity = `concept:${concepts[index][0]}`;
    node.dataset.statement = concepts[index][2];
    node.style.setProperty("--concept-x", positions[index]?.[0] || "20%");
    node.style.setProperty("--concept-y", positions[index]?.[1] || "58%");
    node.innerHTML = `<small>Open concept</small><strong>${concepts[index][1]}</strong>`;
    $(".open-territory").append(node);
  }
}
function renderFixture() {
  const f = fixtures[ventureKey];
  setText("#venture-name", f.name); setText("#return-heading", f.heading); setText("#venture-intent", f.intent);
  setText("#venture-proof", f.proof); setText("#needs-you", f.needs); setText("#recent-return", f.returned); setText("#pressure-summary", f.pressure);
  const loopSelectors = ["#loop-entry", "#loop-action", "#loop-core", "#loop-value", "#loop-return"];
  loopSelectors.forEach((selector, index) => { setText(selector, f.loop[index]); $(selector).nextElementSibling.textContent = f.loopNotes[index]; });
  setText("#product-pressure-title", f.productPressure[0]); setText("#product-pressure-copy", f.productPressure[1]);
  $$("#system-field .system").forEach((node, index) => { node.dataset.entity = `system:${f.systems[index][0]}`; node.querySelector("strong").textContent = f.systems[index][1]; node.querySelector("small").textContent = f.systems[index][2]; });
  $$("#motion-stack .motion").forEach((node, index) => { const m = f.motions[index]; node.dataset.entity = `motion:${m[0]}`; node.dataset.focus = `motion:${m[0]}`; node.querySelector("small").textContent = m[1]; node.querySelector("strong").textContent = m[2]; node.querySelector("em").textContent = m[3]; node.querySelector("b").textContent = m[4]; });
  setText("#campaign-heading", f.campaign); $("#campaign-heading").nextElementSibling.textContent = f.campaignMeta;
  $(".bet-node strong").textContent = f.bet; $(".release-node strong").textContent = f.release; $(".outcome-node strong").textContent = f.outcome;
  setText("#composer-target strong", f.name); $("#composer").placeholder = `Tell ${f.name} what should change…`;
  renderConcepts();
  renderOutline();
}

function setAltitude(next, push = true) {
  if (push && altitude !== next) history.push(altitude);
  altitude = next; app.dataset.altitude = next;
  $$("[data-go]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.go === next)));
  if (next !== "motion" && next !== "bet") closeFocus(false);
}

const focusCopy = {
  "motion:graduate": { kind:"Motion", title:"Graduate → project drop → cohort → proof → referral", trace:[["Actor","Recent graduate"],["System","Builder intake"],["System","Cohort operation"],["System","Work record + proof"],["Value","Referral"]], detail:["A repeatable actor-to-value path","This path predicts what happens before clicking: one actor enters with work, three reusable systems participate, and credible proof creates the next introduction.",["Primary campaign: First twenty project drops","Evidence: 4 of 6 described work before identity","Pressure: referral has no observed return"]] },
  "motion:intelligence": { kind:"Motion", title:"Intelligence → recognition → sponsored cohort → outcomes", trace:[["Artifact","Builder intelligence"],["System","Intelligence production"],["Actor","Institution"],["System","Work record + proof"],["Value","Visible outcomes"]], detail:["A relationship-led path","The same proof system is reused without duplicating it. The motion begins with an intelligence artifact and ends when institutional recognition creates a funded path to visible builder work.",["Primary campaign: State of WNY Builders","Shared system: Work record + proof","Inference: recognition may create sponsorship"]] },
  "motion:event": { kind:"Motion", title:"Event participant → working room → cohort", trace:[["Actor","Event participant"],["Gap","Event activation"],["Value","Working room"],["Product","Matched cohort"]], detail:["An inactive, unsupported path","The motion is architecturally legible but has no campaign, exact release, or returned evidence. Drover shows the reasons; it does not turn absence into a score.",["No active campaign","No release approaching the wall","No joined outcome"]] },
  "campaign:project-drops": { kind:"Campaign", title:"First twenty project drops", trace:[["Motion","Graduate path"],["Campaign","First twenty drops"],["Bet","Drop before profile"],["Release","Project-drop experience"],["Return","4 of 6 described work"]], detail:["A bounded activation, not a task list","Audience, objective, primary motion, measurement contract, bets, exact work, held effect, and returns stay visible in one trace. The campaign has no lifecycle stage.",["Governing bet: one","Supporting bets: two","Founder decision: release exact experience"]] },
  "bet:project-first": { kind:"Bet + exact work", title:"Project drop converts better than profile creation", trace:[["Campaign","First twenty drops"],["Bet","Drop before profile"],["Work","Project-drop experience"],["Wall","Release held"],["Outcome","4 of 6 described work"]], detail:["The uncertain claim being tested","The bet is not the campaign. It can die while the campaign changes its claim, audience, or exact release. Exact staged work and lineage remain in the existing Workyard contract.",["Forked from: intake-before-identity","Owner: Sable · contributor: Rowan","Configuration v12 · taste consulted"]] },
  "release:project-drop": { kind:"Release at the wall", title:"Project-drop experience", trace:[["Bet","Drop before profile"],["Work","4-file product diff"],["Wall","Founder-held"],["World","Not released"]], detail:["Exact consequential work","A release is a projection of the staged artifact plus wall effect and decision receipt—not another durable record. Nothing has crossed the boundary.",["src/project-drop.tsx · +184 −31","Recipient: production product","Second deploy authorization still required"]], diff:"+ Ask what are you trying to build?\n+ Save the first work entry before profile setup\n- Require public identity before project creation" },
  "outcome:drop-return": { kind:"Returned reality", title:"4 of 6 builders described work before making a profile", trace:[["Provider event","drop-006"],["Exact release","Project-drop experience"],["Bet","Drop before profile"],["Campaign","First twenty drops"],["Architecture","Intake path challenged"]], detail:["Joined, not caused","Captured release identity supports the join to exact work and its bet. Campaign and architecture context are inherited as a trace; Drover does not claim the release caused the behavior.",["Evidence basis: captured provider identity","Architecture effect: strengthens intake-first explanation","Unattributed signals remain separate"]] },
};

function focusEntity(key) {
  const fallback = key.startsWith("system:") ? { kind:"Reusable system", title:$(`[data-entity="${key}"] strong`)?.textContent || key, trace:[["System","Persistent capability"],["Motion","Used here"],["Motion","Reused elsewhere"]], detail:["A persistent operating capability","A system can power multiple repeatable motions. It is not a campaign because it persists after a bounded activation ends.",["Founder-addressable","Stored in the architecture document","Execution context follows its selected use"]] } : null;
  const copy = focusCopy[key] || fallback;
  if (!copy) { selectTarget(key); return; }
  focus = key; setAltitude(key.startsWith("bet:") || key.startsWith("release:") || key.startsWith("outcome:") ? "bet" : key.startsWith("campaign:") ? "campaign" : "motion");
  $("#focus-scene").hidden = false; setText("#focus-kicker", copy.kind); setText("#focus-title", copy.title);
  $("#trace").innerHTML = copy.trace.map(([kind,title]) => `<button type="button"><small>${kind}</small><strong>${title}</strong></button>`).join("");
  const extra = copy.diff ? `<section><h3>Exact staged difference</h3><div class="work-diff">${copy.diff}</div></section>` : `<section><h3>What changes execution</h3><p>Directions inherit this architecture context. Return briefs prioritize its held effects, contradictory evidence, and unsupported joins before routine activity.</p></section>`;
  $("#focus-detail").innerHTML = `<section><h3>${copy.detail[0]}</h3><p>${copy.detail[1]}</p><ul>${copy.detail[2].map((item) => `<li>${item}</li>`).join("")}</ul></section>${extra}`;
  selectTarget(key, copy.title);
}

function closeFocus(clear = true) { $("#focus-scene").hidden = true; focus = null; if (clear) clearTarget(); }
function selectTarget(key, label) { const node = $(`[data-entity="${key}"]`); setText("#composer-target strong", label || node?.querySelector("strong")?.textContent || key.split(":")[1]); $("#clear-target").hidden = false; $("#composer").placeholder = "Direct this exact context…"; }
function clearTarget() { setText("#composer-target strong", fixtures[ventureKey].name); $("#clear-target").hidden = true; $("#composer").placeholder = `Tell ${fixtures[ventureKey].name} what should change…`; }
function toast(message) { const node=$("#toast"); node.textContent=message; node.hidden=false; window.clearTimeout(toast.timer); toast.timer=window.setTimeout(()=>{node.hidden=true;},2400); }
function closeConceptPanels() { $("#concept-popover").hidden = true; $("#mutation-preview").hidden = true; selectedConcept = null; }
function openConcept(key) {
  const concept = conceptByKey(key);
  if (!concept) return;
  selectedConcept = key;
  const promoted = promotedConcepts.has(`${ventureKey}:${key}`);
  setText("#concept-kind", promoted ? "Reusable system" : "Open concept");
  setText("#concept-title", concept[1]);
  setText("#concept-statement", concept[2]);
  setText("#concept-truth", promoted ? "Founder-applied role · now available to motion and teammate context" : "Tentatively connected · no execution effect");
  $("#use-in-drover").hidden = promoted || !concept[3];
  $("#concept-popover").hidden = false;
  $("#mutation-preview").hidden = true;
  selectTarget(key, concept[1]);
}
function openConceptEditor() { $("#concept-editor").hidden = false; $("#concept-input").value = ""; $("#concept-input").focus(); }
function closeConceptEditor() { $("#concept-editor").hidden = true; }
function createConcept() {
  const name = $("#concept-input").value.trim();
  if (!name) return;
  const id = `created-${Date.now()}`;
  createdConcepts[ventureKey].push([id, name, "Founder-authored thought; no operational role yet.", false]);
  closeConceptEditor(); renderConcepts(); renderOutline(); openConcept(`concept:${id}`);
  toast(`${name} added as an open concept. Nothing about execution changed.`);
}

function renderOutline() {
  const f=fixtures[ventureKey]; const rows=[["Venture",f.intent],["Product loop",f.loop.join(" → ")],...conceptsForCurrentVenture().map((c)=>[promotedConcepts.has(`${ventureKey}:concept:${c[0]}`)?"System":"Concept",c[1]]),...f.systems.map((s)=>["System",s[1]]),...f.motions.map((m)=>["Motion",m[2]]),["Campaign",f.campaign],["Bet",f.bet],["Release",f.release],["Outcome",f.outcome]];
  $("#outline-list").innerHTML=rows.map(([kind,title],index)=>`<li><button type="button" data-outline-index="${index}"><span>${kind}</span><strong>${title}</strong></button></li>`).join("");
}
function togglePanel(id, open) { const panel=$(id); panel.hidden=!open; const button=$(id==="#outline"?"#outline-button":"#machinery-button"); button?.setAttribute("aria-expanded",String(open)); if(open) panel.querySelector("button")?.focus(); }

document.addEventListener("click", (event) => {
  const button=event.target.closest("button"); const inspectable=event.target.closest("[data-entity]");
  if (button?.dataset.go) { setAltitude(button.dataset.go); if(button.dataset.go==="motion") focusEntity("motion:graduate"); if(button.dataset.go==="campaign") focusEntity("campaign:project-drops"); if(button.dataset.go==="bet") focusEntity("bet:project-first"); return; }
  if (button?.dataset.focus) { focusEntity(button.dataset.focus); return; }
  if (inspectable?.dataset.entity?.startsWith("concept:")) { openConcept(inspectable.dataset.entity); return; }
  if (inspectable?.dataset.entity) { focusEntity(inspectable.dataset.entity); return; }
  if (button?.id==="venture-switch") { const menu=$("#venture-menu"); menu.hidden=!menu.hidden; button.setAttribute("aria-expanded",String(!menu.hidden)); return; }
  if (button?.dataset.venture) { ventureKey=button.dataset.venture; $$("[data-venture]").forEach((item)=>item.setAttribute("aria-selected",String(item===button))); $("#venture-menu").hidden=true; $("#venture-switch").setAttribute("aria-expanded","false"); setAltitude("venture"); closeFocus(); closeConceptPanels(); renderFixture(); toast(`${fixtures[ventureKey].name} opened. Architecture and history stayed isolated.`); return; }
  if (button?.id==="add-concept-button") { openConceptEditor(); return; }
  if (button?.id==="cancel-concept") { closeConceptEditor(); return; }
  if (button?.id==="create-concept") { createConcept(); return; }
  if (button?.id==="concept-close" || button?.id==="keep-open") { closeConceptPanels(); return; }
  if (button?.id==="use-in-drover") { setText("#mutation-subject", conceptByKey(selectedConcept)?.[1] || "This concept"); $("#mutation-preview").hidden=false; return; }
  if (button?.id==="cancel-mutation") { $("#mutation-preview").hidden=true; return; }
  if (button?.id==="apply-mutation") {
    const concept = conceptByKey(selectedConcept); if (!concept) return;
    promotedConcepts.add(`${ventureKey}:${selectedConcept}`); $("#mutation-preview").hidden=true; renderConcepts(); renderOutline(); openConcept(selectedConcept);
    toast(`${concept[1]} is now a reusable system. Revision 18 recorded; Undo is available in history.`); return;
  }
  if (button?.id==="outline-button") togglePanel("#outline",$("#outline").hidden); if(button?.id==="outline-close") togglePanel("#outline",false);
  if (button?.id==="machinery-button") { const open=$("#machinery").hidden; togglePanel("#machinery",open); app.dataset.machinery=open?"open":"closed"; } if(button?.id==="machinery-close") { togglePanel("#machinery",false); app.dataset.machinery="closed"; }
  if (button?.id==="focus-close"||button?.id==="wider-button") { closeFocus(); setAltitude("venture"); }
  if (button?.id==="focus-back") { const previous=history.pop()||"venture"; closeFocus(false); setAltitude(previous,false); }
  if (button?.id==="clear-target") clearTarget();
  if (button?.id==="send-direction") { const text=$("#composer").value.trim(); if(!text)return; $("#composer").value=""; toast(`Direction recorded for ${$("#composer-target strong").textContent}. Architecture context will shape the next drive.`); }
});

document.addEventListener("keydown", (event) => {
  const tag=event.target.tagName; const typing=tag==="TEXTAREA"||tag==="INPUT";
  if ((event.metaKey||event.ctrlKey)&&event.key==="Enter") { event.preventDefault(); $("#send-direction").click(); return; }
  if (typing) return;
  if (event.key.toLowerCase()==="o") { event.preventDefault(); $("#outline-button").click(); return; }
  if (event.key.toLowerCase()==="n") { event.preventDefault(); openConceptEditor(); return; }
  if (/^[1-5]$/.test(event.key)) { const order=["venture","architecture","motion","campaign","bet"]; $(`[data-go="${order[Number(event.key)-1]}"]`).click(); return; }
  if (event.key==="Escape") { if(!$("#concept-editor").hidden)closeConceptEditor(); else if(!$("#mutation-preview").hidden)$("#mutation-preview").hidden=true; else if(!$("#concept-popover").hidden)closeConceptPanels(); else if(!$("#outline").hidden)togglePanel("#outline",false); else if(!$("#machinery").hidden){togglePanel("#machinery",false);app.dataset.machinery="closed";} else if(focus)$("#focus-back").click(); else setAltitude("venture"); }
});

$("#create-concept").addEventListener("click", (event) => { event.stopPropagation(); createConcept(); });
renderFixture();
