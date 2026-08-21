import type { ProjectComponentEntry, ProjectEntry } from "@croki/contracts";

const SOURCE_EXTENSION = /\.(tsx|jsx|vue|svelte)$/i;
const READ_BATCH_SIZE = 32;
const EXCLUDED_PATH =
  /(?:^|\/)(?:node_modules|dist|build|coverage|\.next|\.nuxt|\.svelte-kit|generated|__generated__)(?:\/|$)|\.(?:test|spec|stories|story)\.[^.]+$/i;
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;

type RankedComponent = ProjectComponentEntry & { readonly score: number };

function fileStem(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
}

function scoreComponent(path: string, name: string, isDefaultExport: boolean): number {
  let score = 20;
  if (/(?:^|\/)(?:components?|ui|views?|screens?|pages?)(?:\/|$)/i.test(path)) score += 40;
  if (isDefaultExport) score += 8;
  if (fileStem(path) === name) score += 12;
  if (/(?:^|\/)(?:fixtures?|mocks?|examples?|icons?)(?:\/|$)/i.test(path)) score -= 20;
  if (/(?:^|\/)index\.[^.]+$/i.test(path)) score -= 8;
  return score;
}

function entry(
  path: string,
  exportName: string,
  framework: ProjectComponentEntry["framework"],
  isDefaultExport: boolean,
): RankedComponent {
  return {
    id: `${path}#${exportName}`,
    path,
    exportName,
    displayName: exportName === "default" ? fileStem(path) : exportName,
    framework,
    isDefaultExport,
    score: scoreComponent(path, exportName, isDefaultExport),
  };
}

export function isComponentSourcePath(path: string): boolean {
  return SOURCE_EXTENSION.test(path) && !EXCLUDED_PATH.test(path);
}

export function extractComponents(path: string, source: string): RankedComponent[] {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (extension === "vue" || extension === "svelte") {
    const stem = fileStem(path);
    if (!PASCAL_CASE.test(stem)) return [];
    const named =
      extension === "vue"
        ? source.match(
            /(?:defineOptions\s*\(\s*\{|export\s+default\s*\{)[\s\S]{0,500}?name\s*:\s*["']([A-Z][A-Za-z0-9]*)["']/,
          )?.[1]
        : undefined;
    return [entry(path, named ?? "default", extension, true)];
  }

  const found = new Map<string, RankedComponent>();
  const namedExport =
    /export\s+(?:declare\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Z][A-Za-z0-9]*)/g;
  for (const match of source.matchAll(namedExport)) {
    const name = match[1];
    if (name) found.set(name, entry(path, name, "react", false));
  }
  const defaultNamed =
    /export\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Z][A-Za-z0-9]*)/.exec(source)?.[1];
  if (defaultNamed) found.set(defaultNamed, entry(path, defaultNamed, "react", true));
  if (/export\s+default\s+(?!(?:async\s+)?(?:function|class)\s+[A-Z])/.test(source)) {
    const stem = fileStem(path);
    if (PASCAL_CASE.test(stem)) found.set(stem, entry(path, "default", "react", true));
  }
  return [...found.values()];
}

export async function buildComponentCatalog(
  entries: ReadonlyArray<ProjectEntry>,
  readFile: (path: string) => Promise<string>,
): Promise<{ readonly components: ProjectComponentEntry[]; readonly truncated: boolean }> {
  const candidates = entries.filter(
    (candidate) => candidate.kind === "file" && isComponentSourcePath(candidate.path),
  );
  const capped = candidates.slice(0, 1_000);
  const ranked: RankedComponent[] = [];
  for (let offset = 0; offset < capped.length; offset += READ_BATCH_SIZE) {
    const batch = capped.slice(offset, offset + READ_BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map(async (candidate) =>
        extractComponents(candidate.path, await readFile(candidate.path)),
      ),
    );
    ranked.push(
      ...settled.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
    );
  }
  ranked.sort(
    (left, right) =>
      right.score - left.score ||
      left.displayName.localeCompare(right.displayName) ||
      left.path.localeCompare(right.path),
  );
  return {
    components: ranked.slice(0, 500).map(({ score: _score, ...component }) => component),
    truncated: candidates.length > capped.length || ranked.length > 500,
  };
}
