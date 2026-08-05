export function isPreviewableComponentSource(path: string): boolean {
  return /\.(?:[jt]sx|vue|svelte)$/i.test(path);
}

export function selectPreviewRequestContext<
  TImage extends { id: string },
  TAnnotation extends { id: string },
>(
  images: readonly TImage[],
  annotations: readonly TAnnotation[],
  selectedAnnotationIds: readonly string[],
): { images: TImage[]; annotations: TAnnotation[] } {
  const annotationIds = new Set(selectedAnnotationIds);
  const selectedAnnotations = annotations.filter((annotation) => annotationIds.has(annotation.id));
  return {
    annotations: selectedAnnotations,
    images: images.filter((image) => annotationIds.has(image.id)),
  };
}

export function buildPreviewIdeaPrompt(
  workspaceRoot: string,
  input: {
    idea?: string | undefined;
    sourcePath?: string | undefined;
    exportName?: string | undefined;
  } = {},
): string {
  const { idea, sourcePath, exportName } = input;
  return [
    sourcePath
      ? `Open ${exportName ? `the ${JSON.stringify(exportName)} export from ` : ""}${JSON.stringify(sourcePath)} as a real interactive component in Croki Preview.`
      : "Build an interactive product idea in Croki Preview.",
    "",
    `Work in the current project at ${JSON.stringify(workspaceRoot)}.`,
    "Use the repository's real framework, dependencies, styles, and development server. Create the smallest typed fixture, development route, or prototype needed to render the idea as working code.",
    "Do not return generated HTML, a screenshot, or a prose mockup. Do not add a permanent component system or require Storybook when the repository does not already use it.",
    "Open the working result in the existing Croki Preview with the available preview tools. Keep experimental alternatives provisional and outside the production path until I choose one.",
    "If the direction is workable, make reversible assumptions and show the first useful result without asking implementation questions.",
    "",
    sourcePath
      ? "Create or reuse only the development state needed to make it usable."
      : `Direction: ${idea?.trim() || "Create the smallest useful product expression implied by the current Thread."}`,
  ].join("\n");
}

export function buildPreviewOptionsPrompt(workspaceRoot: string): string {
  return [
    "Explore materially different interactive alternatives for the selected Preview target.",
    "",
    `Work in the current project at ${JSON.stringify(workspaceRoot)}.`,
    "Use the attached preview annotation, component/source attribution, current viewport, and repository design rules as the comparison boundary.",
    "Create three code-backed options that differ in product or interaction consequence, not cosmetic noise. Render them with the project's real framework, dependencies, styles, and development server.",
    "Keep the original intact and keep alternatives provisional until I choose one. Do not integrate an option into the production path yet.",
    "Open each option with a new Croki Preview tab (reuseExistingTab=false) so I can interact with them under the same content, state, theme, and viewport. Keep every tab that existed before this exploration unchanged. Summarize only the meaningful tradeoff of each option.",
  ].join("\n");
}

export function buildPreviewDecisionPrompt(
  workspaceRoot: string,
  decision: "keep" | "combine" | "discard",
  activeUrl: string,
  direction?: string,
): string {
  const context = [
    `Work in the current project at ${JSON.stringify(workspaceRoot)}.`,
    `The active Preview option is ${JSON.stringify(activeUrl)}.`,
  ];

  if (decision === "discard") {
    return [
      "Discard the provisional Preview alternatives and return to the original implementation.",
      ...context,
      "Remove only temporary option fixtures, routes, and files created for this exploration. Do not change the original product code. Close provisional Preview tabs and reopen the original result.",
    ].join("\n");
  }

  return [
    decision === "keep"
      ? "Keep the active Preview option and integrate its product and interaction decisions into the real source."
      : "Combine the active Preview option with the following direction, then integrate the coherent result into the real source.",
    ...context,
    ...(decision === "combine"
      ? [
          `Direction: ${direction?.trim() || "Preserve the strongest parts of the original and active option."}`,
        ]
      : []),
    "Delete temporary option-only fixtures after integration, preserve unrelated work, run focused verification, and leave the resulting code ready to inspect in Review.",
    "Open the integrated result in Croki Preview when it is ready.",
  ].join("\n");
}
