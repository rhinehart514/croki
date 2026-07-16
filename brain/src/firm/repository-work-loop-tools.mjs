// Provider-neutral, host-bounded repository grounding. Search only locates possible truth; an exact
// excerpt becomes a citable source after the host has re-resolved the path under the venture root.

import { readRepositoryExcerpt, searchRepository } from "./truth.mjs";

export function buildRepositoryWorkLoopTools({ cwd, trackCall, capturedSources }) {
  return [
    {
      name: "search_repository",
      description: "Search the venture repository for exact text. Results locate evidence but are not citations until read_repository_excerpt captures the lines.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", minLength: 1, maxLength: 200 },
          include: { type: "array", items: { type: "string" }, maxItems: 12 },
          maxResults: { type: "integer", minimum: 1, maximum: 50 },
        },
        required: ["query"],
      },
      async run(input = {}) {
        trackCall("search_repository");
        return searchRepository(cwd, input);
      },
    },
    {
      name: "read_repository_excerpt",
      description: "Read and capture an exact path-bounded line range as a durable repository source for the current working theory.",
      input_schema: {
        type: "object",
        properties: {
          file: { type: "string" },
          startLine: { type: "integer", minimum: 1 },
          endLine: { type: "integer", minimum: 1 },
        },
        required: ["file", "startLine"],
      },
      async run(input = {}) {
        trackCall("read_repository_excerpt");
        const source = readRepositoryExcerpt(cwd, input);
        capturedSources.set(source.ref, source);
        return { source, citation: source.ref };
      },
    },
  ];
}
