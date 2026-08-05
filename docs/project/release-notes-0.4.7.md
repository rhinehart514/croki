# Croki 0.4.7 daily-driver plan

Croki 0.4.7 hardens the existing development loop and introduces Preview exploration as a default-off Beta.

## Preview is the product workbench

The right panel now names its browser surface **Preview**. A founder chooses **App**, **Component**, or **Idea** directly in Preview. Ideas are described and built from that surface; the founder does not prepare or send a composer prompt.

The selected native provider builds the smallest real repository-native fixture, development route, or prototype using the project's framework, dependencies, styles, and development server. Croki then reuses its existing local-server discovery, browser automation, React-aware element attribution, annotation, screenshot, recording, and responsive viewport paths to make the result interactive.

Preview exploration asks for three materially different code-backed options when the founder selects a rendered target. Each option opens as an interactive Preview tab under comparable state. The original stays intact and options remain provisional until the founder chooses **Keep**, **Combine**, or **Discard** in Preview. Keep and Combine integrate through the provider and leave the result inspectable in Review; Discard removes provisional work and restores the original. Croki does not generate static HTML, require Storybook, add a framework-specific component runtime, or silently integrate an option.

Component source files supported by the initial Beta (`.tsx`, `.jsx`, `.vue`, and `.svelte`) expose **Preview component** from the existing file surface. Selecting it immediately asks the provider to create or reuse only the development state required to render the component as working code, then opens that result in Preview.

## Canvas remains optional

When Canvas Beta is disabled, Canvas is absent from the right-panel surface picker, add-surface menu, persisted active surface, Preview and file evidence controls, command palette, and Thread timeline. Disabling Canvas preserves the underlying Threads and repository work and does not affect Preview or native provider behavior.

## Verification

The 0.4.7 boundary is covered by client-setting defaults and opt-in tests, Preview execution and decision prompt tests, direct decision-state rendering tests, component-source tests, right-panel Canvas visibility tests, Preview navigation tests, contracts/web/desktop typechecks, and `npm run check:croki`.
