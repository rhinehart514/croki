# Croki product design

Croki is for people directing serious software work across long-running Threads. It keeps the canonical conversation, the work happening around it, and the evidence needed to judge the result in one dense workspace.

## Product nouns and behavior

- A **Thread** is the canonical conversation and unit of work.
- Explicitly delegated parallel work creates durable **worker Threads** beneath the parent Thread. Worker Threads have their own transcript and lifecycle, survive reloads, and never become competing canonical conversations.
- The left rail nests worker Threads directly beneath their parent. Selecting a worker opens its read-only transcript; **Continue in parent** returns to the canonical Thread.
- Ordinary work must not expose worker or orchestration chrome when no delegation exists.
- Native Codex voice lives beside the Thread composer only for Codex Threads. Spoken turns act directly in the native realtime session; they do not populate the unsent draft. Croki exposes honest connecting, listening, stopping, and typing-fallback states without relaying or persisting raw audio.

## Interface direction

- Preserve the existing true-black, dense workspace with white primary text.
- Status belongs beside the work it describes. Avoid decorative pills and explanatory chrome.
- Worker nesting uses indentation and a quiet rule, not a second navigation section or dashboard.
- Long titles truncate in the rail and remain available in the Thread view. Keyboard focus and status labels remain explicit.

## Stack

React, TypeScript, TanStack Router, Effect Atom state, Base UI primitives, Tailwind CSS, and Lucide icons. Existing sidebar, timeline, and typography tokens are the source of truth.
