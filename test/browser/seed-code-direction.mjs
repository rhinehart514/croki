#!/usr/bin/env node
// Seed a representative CODE-HEAVY direction into a fixture venture so the real running product can be
// rendered and inspected: a multi-file repository change (added / removed / modified), tests + build,
// a working preview, an apply decision, a separate deploy decision, and a market consequence returned
// to the same direction. Additive demo data on a fixture venture; touches nothing real.
//
//   node test/browser/seed-code-direction.mjs [--home ~/.gtm-ide] [--venture fixture-buffalo-projects]
import os from "node:os";
import { createBet } from "../../brain/src/firm/bet.mjs";
import { park } from "../../brain/src/firm/wall.mjs";
import { recordOutcome } from "../../brain/src/firm/market.mjs";
import { setVentureDoc } from "../../brain/src/firm/venture-store.mjs";
import { appendConversationMessage } from "../../brain/src/firm/conversation.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith("--") ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []));
const HOME = (args.home ?? "~/.gtm-ide").replace(/^~/, os.homedir());
const VENTURE = args.venture ?? "fixture-buffalo-projects";
const options = { root: HOME };

const DIFF = `diff --git a/src/onboarding/FirstRun.tsx b/src/onboarding/FirstRun.tsx
--- a/src/onboarding/FirstRun.tsx
+++ b/src/onboarding/FirstRun.tsx
@@ -3,9 +3,7 @@ import { WorkspaceProbe } from "./WorkspaceProbe";
 export function FirstRun({ user }: { user: User }) {
-  return (
-    <SetupWizard steps={6}>
-      <ConnectRepo />
-      <ChooseModel />
-      <InviteTeam />
-    </SetupWizard>
-  );
+  // Show a useful result before asking for any setup.
+  return <InstantValue user={user} onReady={() => <SetupWizard steps={2} deferred />} />;
 }
diff --git a/src/onboarding/InstantValue.tsx b/src/onboarding/InstantValue.tsx
new file mode 100644
--- /dev/null
+++ b/src/onboarding/InstantValue.tsx
@@ -0,0 +1,12 @@
+import { useFirstResult } from "./useFirstResult";
+
+// The first thing a new user sees is a real result, not a form.
+export function InstantValue({ user, onReady }: InstantValueProps) {
+  const result = useFirstResult(user);
+  if (!result) return <Forming />;
+  return (
+    <section aria-label="Your first result">
+      <Result value={result} />
+      {onReady()}
+    </section>
+  );
+}
diff --git a/src/onboarding/SetupWizard.tsx b/src/onboarding/SetupWizard.tsx
--- a/src/onboarding/SetupWizard.tsx
+++ b/src/onboarding/SetupWizard.tsx
@@ -12,7 +12,7 @@ export function SetupWizard({ steps, deferred = false }: SetupWizardProps) {
-  const gate = useMandatoryGate();
+  const gate = deferred ? null : useMandatoryGate();
   return <Wizard gate={gate} total={steps} />;
 }
diff --git a/src/onboarding/legacy/SixStepIntro.tsx b/src/onboarding/legacy/SixStepIntro.tsx
deleted file mode 100644
--- a/src/onboarding/legacy/SixStepIntro.tsx
+++ /dev/null
@@ -1,4 +0,0 @@
-// Retired: the six-decision intro that blocked first value.
-export function SixStepIntro() {
-  return <SetupWizard steps={6} />;
-}
`;

const bet = createBet({
  ventureId: VENTURE,
  intent: "rebuild first-run so value precedes setup",
  teammateRef: "outreach-writer",
  staged: [{
    id: "staged-firstrun-preview",
    title: "Working preview — new first-run experience",
    content: "PREVIEW\n\nNew users now land on a real first result within seconds. The six-step setup is deferred to two optional steps, shown only after the user has seen value. Screens: 01-first-result.png, 02-deferred-setup.png.",
  }],
});
setVentureDoc(VENTURE, "bets", bet.id, bet, options);

const founder = appendConversationMessage({
  ventureId: VENTURE,
  role: "founder",
  content: "Fix why signups stall: people land expecting value but hit six setup steps. Fix what you can.",
  teammateRef: null,
  betId: null,
}, options);

appendConversationMessage({
  ventureId: VENTURE,
  role: "system",
  kind: "handoff",
  content: "Rebuilt the first-run experience and prepared the market-facing changes it implies.",
  teammateRef: "outreach-writer",
  betId: bet.id,
  changes: { openedBetIds: [bet.id], stagedBetIds: [bet.id], wallBetIds: [bet.id] },
}, options);

// Decision 1 — apply the exact repository change.
park({
  ventureId: VENTURE, betId: bet.id, workRef: "firstrun-revision", purpose: "release",
  effect: {
    kind: "product-change",
    title: "Apply the new first-run experience",
    reason: "The landing page promises immediate value; the product opened with six setup decisions.",
    repository: "github.com/buffalo-projects/app",
    diff: DIFF,
    diffStat: "4 files · +21 −13",
    tests: "Tests passed (14)",
    preview: "https://preview.buffalo-projects.dev/first-run",
  },
}, options);

// Decision 2 — a separate, independently held deploy.
park({
  ventureId: VENTURE, betId: bet.id, workRef: "firstrun-deploy", purpose: "release",
  effect: {
    kind: "deploy",
    title: "Deploy the first-run change to production",
    body: "Release the reviewed first-run change to the live site.",
    to: "buffalo-projects.dev (production)",
  },
}, options);

// A market-facing consequence of the same direction (P3 seed): a returned reply, honestly attributed.
recordOutcome({
  ventureId: VENTURE, joinKey: bet.joinKey, workRef: "firstrun-revision",
  outcomeKind: "reply", from: "an early user", channel: "email",
  body: "The new first screen finally showed me something useful before asking me to configure anything.",
  providerEventId: "seed-firstrun-reply",
}, options);

console.log(`seeded code-heavy direction on ${VENTURE}: bet ${bet.id}, direction ${founder.id}`);
