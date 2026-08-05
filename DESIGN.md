# Croki product design

Croki is the daily agentic development environment for a founder building real products with native coding-agent providers. The founder directs work in a Thread, experiences the result in Preview, verifies code in Review, and uses Git to ship it.

## Product result

The first useful result is a real provider working inside a real repository while the founder can see what changed, intervene at a consequential decision, verify the result, recover, and ship without reconstructing state across tools.

Thread is the canonical conversation and direction. Preview is the interactive surface for experiencing the running product, a repository-native component fixture, or a provisional product option. Review owns code acceptance. Canvas is an optional Beta projection of project and Thread activity; it is never required for Preview, provider context, or execution.

## Durable interaction decisions

- Preview uses the project's real framework, dependencies, styles, runtime, and development server. It does not substitute generated HTML or screenshots for a working component.
- New component previews are repository-native typed fixtures, development routes, or prototypes created through the selected provider. Croki reuses its existing project-script, server-discovery, browser-automation, annotation, and recording paths instead of owning a second framework runtime.
- Component discovery lives inside Preview. Croki automatically indexes exported React, Vue, and Svelte components and presents component names first, with source paths as metadata; choosing one sends the exact source and export directly to the provider without opening Files or requiring a user-written prompt.
- Preview exploration is a default-off Beta. Preview owns the direct App, Component, and Idea entry points and submits that work without making the founder construct or send a prompt. It creates a small number of materially different, interactive, code-backed options. Options remain provisional and keep the original intact until the founder chooses Keep, Combine, or Discard in Preview; integration remains visible in Thread and inspectable in Review.
- Direct Preview feedback carries the selected element, React component and source attribution when available, route, viewport, annotation, and captured image back to the Thread. The founder should not need to describe what Croki can already perceive.
- When Canvas Beta is disabled, Canvas is absent from right-panel entries, actions, timeline presentations, and provider behavior. Disabling it preserves underlying Threads and repository work.
- Runtime, context, tools, permissions, Preview, Canvas, and harnesses remain separate. Opening or arranging a surface never grants authority or changes native provider behavior.

## Presentation

Preserve the existing information-dense Croki workspace and right-rail tab behavior. Default controls stay quiet. The active result, Stop, failure, recovery, and required founder judgment take precedence over passive telemetry. Use existing tokens, components, typography, icons, focus behavior, and responsive panel layouts from `apps/web` rather than introducing a parallel visual system.

## Trust and states

Preview distinguishes no target, server discovery, loading, working result, unreachable runtime, unsupported client, active agent control, annotation, and captured evidence. A provisional option never appears integrated or verified. Failures preserve the founder's prompt, selected target, annotations, and completed work whenever the underlying system permits it.
