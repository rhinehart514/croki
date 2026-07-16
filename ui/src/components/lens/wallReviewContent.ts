import type { WallQueueItemView } from "@/api";

export type ReviewDetail = { label: string; value: string; tone?: "voice" | "artifact" | "receipt" };
export type ReviewContent = {
  eyebrow: string;
  title: string;
  why: string;
  details: ReviewDetail[];
  releaseReady?: boolean;
};

export function readable(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

function firstReadable(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = readable(record[key]);
    if (value) return value;
  }
  return null;
}

function destinationFor(effect: Record<string, unknown>): string | null {
  const direct = firstReadable(effect, ["to", "recipient", "destination", "audience", "channel", "url"]);
  if (direct) return direct;
  const recipients = effect.recipients;
  if (!Array.isArray(recipients)) return null;
  const values = recipients.map(readable).filter((value): value is string => Boolean(value));
  return values.length ? values.join(", ") : null;
}

function exactRevision(effect: Record<string, unknown>): string | null {
  const revision = effect.configurationRevision ?? effect.revision;
  return typeof revision === "number" || typeof revision === "string" ? `Revision ${revision}` : null;
}

function outcomeTitle(kind: string | null): string {
  switch (kind?.toLowerCase()) {
    case "reply": return "A reply came back";
    case "meeting": return "A meeting was booked";
    case "purchase": return "A purchase came back";
    case "objection": return "An objection came back";
    case "ignored": return "No response came back";
    default: return "The market answered";
  }
}

function releaseContent(effect: Record<string, unknown>): ReviewContent {
  const kind = readable(effect.kind)?.toLowerCase() ?? null;
  const destination = destinationFor(effect);
  const subject = readable(effect.subject);
  const body = firstReadable(effect, ["body", "message", "draft", "content", "text"]);
  const proof = firstReadable(effect, ["proof", "evidence", "source", "citation"]);
  const revision = exactRevision(effect);

  if (kind === "product-change") {
    const summary = firstReadable(effect, ["diffStat", "summary"]);
    const artifact = firstReadable(effect, ["diff", "patch", "artifact"]);
    return {
      eyebrow: "Product change",
      title: firstReadable(effect, ["title", "intent"]) ?? "Product change ready for review",
      why: firstReadable(effect, ["reason", "why"]) ?? "Applying this difference would write into the bound product repository.",
      details: [
        { label: "Exact difference", value: artifact ?? "The patch preview is unavailable. Applying must stay unavailable until it can be verified.", tone: "artifact" },
        ...(summary ? [{ label: "Proof", value: summary, tone: "receipt" as const }] : []),
        { label: "Consequence", value: "Apply writes the reviewed patch locally. It does not commit, push, or deploy it." },
        ...(revision ? [{ label: "Revision crossing", value: revision, tone: "receipt" as const }] : []),
      ],
      releaseReady: Boolean(artifact),
    };
  }

  if (kind === "deploy") {
    return {
      eyebrow: "Ready to deploy",
      title: firstReadable(effect, ["title", "subject", "intent"]) ?? "Deploy ready for review",
      why: firstReadable(effect, ["reason", "why"]) ?? "This release would change a live destination and requires a second explicit authorization.",
      details: [
        { label: "Exact act", value: body ?? "The deploy contents could not be described safely." },
        ...(destination ? [{ label: "Destination", value: destination }] : []),
        ...(proof ? [{ label: "Proof", value: proof, tone: "receipt" as const }] : []),
        { label: "Consequence", value: "Authorization permits only this deploy. Releasing remains a separate founder act." },
        ...(revision ? [{ label: "Revision crossing", value: revision, tone: "receipt" as const }] : []),
      ],
      releaseReady: Boolean(body),
    };
  }

  const knownMessage = kind === "message" || kind === "send";
  const summary = firstReadable(effect, ["title", "subject", "intent", "summary"]);
  return {
    eyebrow: knownMessage ? "Ready to send" : "Waiting for your review",
    title: knownMessage ? subject ?? "Message ready for review" : summary ?? "Action ready for review",
    why: firstReadable(effect, ["reason", "why"]) ?? "This act would leave Drover and cannot proceed without your hand.",
    details: [
      { label: "Exact act", value: body ?? "Drover cannot safely describe this action. Reject it unless you recognize the work.", tone: body ? "voice" : undefined },
      ...(destination ? [{ label: "Destination", value: destination }] : []),
      ...(proof ? [{ label: "Proof", value: proof, tone: "receipt" as const }] : []),
      { label: "Consequence", value: body ? "Release performs this one outward act." : "The consequence is not legible enough to release safely." },
      ...(revision ? [{ label: "Revision crossing", value: revision, tone: "receipt" as const }] : []),
    ],
    releaseReady: Boolean(body),
  };
}

function outcomeJoin(outcome: Record<string, unknown>): string {
  const structural = outcome.structural && typeof outcome.structural === "object"
    ? outcome.structural as Record<string, unknown>
    : {};
  const joined = outcome.joined === true || structural.joined === true;
  if (readable(outcome.providerEventId) || readable(outcome.providerSourceId)) return "Provider-backed join";
  if (joined) return "Evidence-supported join";
  if (readable(outcome.source)?.toLowerCase().includes("infer")) return "Teammate inference";
  return "Unattributed return";
}

export function reviewContent(item: WallQueueItemView): ReviewContent {
  const effect = item.effect;
  if (item.purpose === "release") return releaseContent(effect);

  if (item.purpose === "answer") {
    return {
      eyebrow: "Needs your input",
      title: "A teammate needs your answer",
      why: firstReadable(effect, ["reason", "why"]) ?? "The teammate stopped before making a founder judgment on your behalf.",
      details: [
        { label: "Question", value: readable(effect.question) ?? "The question could not be shown safely." },
        { label: "Consequence", value: "Answer returns your words to this direction. Dismiss records no answer." },
      ],
    };
  }

  if (item.purpose === "end-bet") {
    return {
      eyebrow: "Ending decision",
      title: "Should this work end?",
      why: firstReadable(effect, ["reason", "question", "summary"]) ?? "No reason was included with this request.",
      details: [
        { label: "Exact act", value: "End stops this work by your decision. Keep returns it to the firm." },
        { label: "Consequence", value: "Only you can end this work; prepared work and its receipt remain readable." },
      ],
    };
  }

  const outcome = effect.outcome && typeof effect.outcome === "object"
    ? effect.outcome as Record<string, unknown>
    : {};
  const identifying = outcome.identifying && typeof outcome.identifying === "object"
    ? outcome.identifying as Record<string, unknown>
    : {};
  const body = readable(outcome.body) ?? readable(identifying.body);
  const betIntent = readable(identifying.betIntent);
  return {
    eyebrow: "From the market",
    title: outcomeTitle(readable(outcome.outcomeKind)),
    why: "The market's words are durable whether they support, reject, or leave the direction unresolved.",
    details: [
      { label: "Market words", value: body ?? "This return did not include a message.", tone: "voice" },
      { label: "Provenance", value: outcomeJoin(outcome), tone: "receipt" },
      ...(betIntent ? [{ label: "Joined direction", value: betIntent }] : []),
      { label: "Consequence", value: "Acknowledge records that you reviewed this return. It does not release or end the work." },
    ],
  };
}
