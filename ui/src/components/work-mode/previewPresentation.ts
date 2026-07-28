export type PreviewViewport = "responsive" | "desktop" | "tablet" | "mobile";
export type WorkMaterial = "changes" | "preview" | "history";
export type WorkReviewTarget = WorkMaterial | "comparison" | "repository";

export type RepositoryReviewTarget = {
  path: string;
  startLine: number;
  endLine: number;
  digest?: string;
};

export type WorkReviewRequest = {
  threadRef?: string;
  workspaceId?: string;
  target: WorkReviewTarget;
  repository?: RepositoryReviewTarget;
  source?: HTMLElement | null;
};

export type PreviewPresentation = {
  url: string;
  viewport: PreviewViewport;
  zoom: number;
};

const PREVIEW_KEY = "drover:work-preview:v1:";
const MATERIAL_KEY = "drover:work-material:v1:";
const REPOSITORY_REVIEW_KEY = "drover:repository-review:v1:";
export const WORK_REVIEW_REQUEST_EVENT = "drover:work-review-request";
const FALLBACK: PreviewPresentation = { url: "", viewport: "responsive", zoom: 1 };

export function workPresentationScope(ventureId: string, threadRef: string): string {
  return `${encodeURIComponent(ventureId)}:${encodeURIComponent(threadRef)}`;
}

export function readPreviewPresentation(scope: string): PreviewPresentation {
  try {
    const value = JSON.parse(localStorage.getItem(`${PREVIEW_KEY}${scope}`) ?? "null") as Partial<PreviewPresentation> | null;
    const viewport = ["responsive", "desktop", "tablet", "mobile"].includes(String(value?.viewport))
      ? value!.viewport as PreviewViewport
      : FALLBACK.viewport;
    const zoom = Number(value?.zoom);
    return {
      url: typeof value?.url === "string" ? value.url : "",
      viewport,
      zoom: Number.isFinite(zoom) ? Math.min(2, Math.max(0.5, zoom)) : 1,
    };
  } catch {
    return FALLBACK;
  }
}

export function rememberPreviewPresentation(scope: string, value: PreviewPresentation) {
  try { localStorage.setItem(`${PREVIEW_KEY}${scope}`, JSON.stringify(value)); }
  catch { /* presentation memory is disposable */ }
}

export function readWorkMaterial(scope: string): WorkMaterial {
  try {
    const value = localStorage.getItem(`${MATERIAL_KEY}${scope}`);
    return value === "preview" || value === "history" ? value : "changes";
  } catch {
    return "changes";
  }
}

export function rememberWorkMaterial(scope: string, material: WorkMaterial) {
  try { localStorage.setItem(`${MATERIAL_KEY}${scope}`, material); }
  catch { /* presentation memory is disposable */ }
}

export function readRepositoryReview(scope: string): RepositoryReviewTarget | null {
  try {
    const value = JSON.parse(localStorage.getItem(`${REPOSITORY_REVIEW_KEY}${scope}`) ?? "null") as Partial<RepositoryReviewTarget> | null;
    if (!value || typeof value.path !== "string" || !value.path || value.path.startsWith("/")) return null;
    if (!Number.isSafeInteger(value.startLine) || !Number.isSafeInteger(value.endLine)
      || value.startLine! < 1 || value.endLine! < value.startLine!) return null;
    return {
      path: value.path,
      startLine: value.startLine!,
      endLine: value.endLine!,
      ...(typeof value.digest === "string" ? { digest: value.digest } : {}),
    };
  } catch {
    return null;
  }
}

export function rememberRepositoryReview(scope: string, target: RepositoryReviewTarget | null) {
  try {
    if (target) localStorage.setItem(`${REPOSITORY_REVIEW_KEY}${scope}`, JSON.stringify(target));
    else localStorage.removeItem(`${REPOSITORY_REVIEW_KEY}${scope}`);
  } catch { /* presentation memory is disposable; source contents never enter it */ }
}

// Transcript references and venture search both target the one contextual Review. A window event keeps
// that presentation request feature-local: durable Thread/Review identities stay in the data model, while
// the currently mounted Work surface decides whether the requested attempt still exists.
export function requestWorkReview(request: WorkReviewRequest) {
  window.dispatchEvent(new CustomEvent<WorkReviewRequest>(WORK_REVIEW_REQUEST_EVENT, { detail: request }));
}

export function requestRepositoryReview(
  repository: RepositoryReviewTarget,
  options: Pick<WorkReviewRequest, "threadRef" | "source"> = {},
) {
  requestWorkReview({ ...options, target: "repository", repository });
}
