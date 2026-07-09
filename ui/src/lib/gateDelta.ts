// buildGateDelta — maps a staged gate item into the multi-modal GateDelta the GateDeltaCard renders
// (GTM-MACHINE.md Area 5, MOVE 1). A staged microproduct / in-repo change / page-generator item carries
// the producer's artifact on free-form keys (artifactSpec, artifactFiles, preview, buildWorktree, and for
// an in-repo change kind:"change" + repo + path). This reads them defensively — every hop is shape-checked
// so a missing field degrades, never throws — and returns the delta shaped for the card:
//
//   in-repo change  → kind:"change", the touched files + a diff, deployConfirmable:true (the heavier
//                     "Ship it live" second authorization the deploy connector requires)
//   page generator  → kind:"page", a sampled set of rendered pages ("3 of 1,240")
//   microproduct    → kind:"change" without deployConfirmable when it's a standalone artifact preview,
//                     shown as the built HTML (the founder reviews the real page)
//
// A NON-code-native item returns null — the caller renders the normal draft card. This never changes the
// wall: the card decides nothing; it hands the founder's call back, and only a "ship" carries
// deployConfirmed:true through to the real gate resolve.

import type { GateDelta, GateDeltaFile, GateDeltaPage, GTMItem } from "@/types";

type StagedFile = { path?: unknown; contents?: unknown; additions?: unknown; deletions?: unknown };
type ArtifactSpec = {
  name?: unknown; summary?: unknown; entry?: unknown; kind?: unknown; inRepo?: unknown;
  sampledPages?: unknown; groundedClaims?: unknown;
};
type StagedCodeItem = GTMItem & {
  artifactSpec?: ArtifactSpec | null;
  artifactFiles?: unknown;
  files?: unknown;
  preview?: { entry?: unknown; files?: unknown } | null;
  buildWorktree?: unknown;
  kind?: unknown;
  repo?: unknown;
  path?: unknown;
  diff?: unknown;
  pages?: unknown;
  sampledPages?: unknown;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const isHtml = (p: unknown) => typeof p === "string" && /\.html?$/i.test(p);

function filesOf(item: StagedCodeItem): StagedFile[] {
  if (Array.isArray(item.artifactFiles)) return item.artifactFiles as StagedFile[];
  if (Array.isArray(item.files)) return item.files as StagedFile[];
  return [];
}

// Is this staged item a code-native change / microproduct / page generator? The honest marker is a
// producer artifact: it carries files. A plain outbound draft never does.
export function gateItemIsCodeNative(item: GTMItem): boolean {
  return filesOf(item as StagedCodeItem).length > 0;
}

// The entry HTML file's full text, for a standalone microproduct preview (the same static-preview
// technique MicroproductFace uses). Null when there's no HTML entry to show.
function entryHtml(item: StagedCodeItem, files: StagedFile[]): string | null {
  const entryName = str(item.preview?.entry) ?? str(item.artifactSpec?.entry) ?? "index.html";
  const entry =
    files.find((f) => f.path === entryName) ??
    files.find((f) => isHtml(f.path)) ??
    files[0];
  return entry && isHtml(entry.path) && typeof entry.contents === "string" ? entry.contents : null;
}

// The sampled rendered pages for a page-generator item. The producer names sample page paths on
// spec.sampledPages; each one whose file we hold and which renders as HTML becomes a preview.
function samplePages(item: StagedCodeItem, files: StagedFile[]): GateDeltaPage[] {
  const named = Array.isArray(item.artifactSpec?.sampledPages)
    ? (item.artifactSpec!.sampledPages as unknown[]).map(str).filter((s): s is string => !!s)
    : [];
  const paths = named.length ? named : files.filter((f) => isHtml(f.path)).map((f) => String(f.path));
  const pages: GateDeltaPage[] = [];
  for (const p of paths.slice(0, 6)) {
    const file = files.find((f) => f.path === p);
    if (file && typeof file.contents === "string") {
      pages.push({ route: p, label: p, html: file.contents });
    }
  }
  return pages;
}

// A best-effort file list for the change pill row — the touched paths, with +/− counts when the producer
// supplied them (it usually won't for a fresh scaffold, so the counts are optional).
function changeFiles(files: StagedFile[]): GateDeltaFile[] {
  return files.map((f) => ({
    path: String(f.path ?? "(file)"),
    additions: typeof f.additions === "number" ? f.additions : undefined,
    deletions: typeof f.deletions === "number" ? f.deletions : undefined,
  }));
}

export function buildGateDelta(
  item: GTMItem,
  ctx: { motionLabel?: string | null; transportConnected?: boolean } = {},
): GateDelta | null {
  const it = item as StagedCodeItem;
  const files = filesOf(it);
  if (!files.length) return null;

  const spec = it.artifactSpec ?? null;
  const title = str(spec?.name) ?? str(item.plainLanguageTitle) ?? str(spec?.summary) ?? "A change from your product";
  const summary = str(spec?.summary) ?? str(item.whatYourYesDoes) ?? null;
  const specKind = str(spec?.kind);
  const provenance = Array.isArray(spec?.groundedClaims) && spec!.groundedClaims!.length
    ? `Grounded on: ${(spec!.groundedClaims as unknown[]).map(str).filter(Boolean).join("; ")}`
    : null;

  // An in-repo product CHANGE — the item the producer flagged inRepo, or that carries the change-object
  // identity (kind:"change" + repo + path). This gets the heavier "Ship it live" second authorization.
  const isInRepoChange =
    it.kind === "change" || spec?.inRepo === true || (!!str(it.repo) && !!str(it.path));

  if (isInRepoChange) {
    const path = str(it.path) ?? str(spec?.entry) ?? (files[0] ? String(files[0].path) : null);
    return {
      kind: "change",
      title,
      whatYourYesDoes: str(item.whatYourYesDoes),
      motionLabel: ctx.motionLabel ?? null,
      provenance,
      summary,
      diff: str(it.diff),
      files: changeFiles(files),
      change: path ? { verb: "Change", object: path } : null,
      deployConfirmable: true,
      shipPath: str(it.repo)
        ? "opens a pull request on your repo"
        : "ships it live to your product",
      transportConnected: ctx.transportConnected ?? false,
    };
  }

  // A page-generator item — a sampled set of real rendered pages ("3 of N"). Detected by the producer's
  // page-generator kind or by multiple HTML files with named samples.
  const pages = samplePages(it, files);
  if (specKind === "page-generator" || (pages.length > 1 && Array.isArray(spec?.sampledPages))) {
    return {
      kind: "page",
      title,
      whatYourYesDoes: str(item.whatYourYesDoes),
      motionLabel: ctx.motionLabel ?? null,
      provenance,
      summary,
      pages,
      sampledFrom: pages.length,
      // The generator's real corpus size, if the producer stated it; else honest to the sample shown.
      total: typeof (spec as { total?: unknown })?.total === "number" ? (spec as { total: number }).total : pages.length,
      transportConnected: ctx.transportConnected ?? false,
    };
  }

  // A standalone microproduct — its own artifact, reviewed as the built page. Rendered through the change
  // card's file list + (when there's an HTML entry) a single page preview, WITHOUT the ship second-auth:
  // a standalone artifact's ship path is the hosted deploy runner, gated by the same approve, but it does
  // not open a PR on the founder's repo, so it uses a plain approve here. The built preview is the review.
  const html = entryHtml(it, files);
  if (html) {
    return {
      kind: "page",
      title,
      whatYourYesDoes: str(item.whatYourYesDoes),
      motionLabel: ctx.motionLabel ?? null,
      provenance,
      summary,
      pages: [{ route: str(spec?.entry) ?? "index.html", label: title, html }],
      sampledFrom: 1,
      total: 1,
      transportConnected: ctx.transportConnected ?? false,
    };
  }

  // Files with no HTML entry and not flagged in-repo — show them as a change (file list + any diff),
  // plain approve. Honest: it's a producer artifact the founder reviews as files.
  return {
    kind: "change",
    title,
    whatYourYesDoes: str(item.whatYourYesDoes),
    motionLabel: ctx.motionLabel ?? null,
    provenance,
    summary,
    diff: str(it.diff),
    files: changeFiles(files),
    change: null,
    deployConfirmable: false,
    transportConnected: ctx.transportConnected ?? false,
  };
}
