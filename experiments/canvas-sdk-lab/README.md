# Croki Canvas SDK Lab

An isolated interaction artifact comparing React Flow, tldraw, Konva, Excalidraw, and Cytoscape against the same Croki semantic projections.

This is not a production Canvas implementation. It does not read or write `.croki/context.json`, create Runs, or add any SDK to the Croki web application. Its purpose is to expose the interaction and product gravity of each package before one enters the production surface.

## Run

```bash
pnpm install --ignore-workspace
pnpm dev
```

Open the URL printed by Vite. Use keys `1` through `5` to switch SDKs, or select them from the header.

## Evaluation

- Change between Product, GTM, Workflow, and Review while holding the SDK constant.
- Select and move objects, then inspect how naturally the package supports Croki's existing selection inspector.
- Notice what each SDK adds beyond the project model: tools, menus, persistence assumptions, scene state, and rendering constraints.
- Treat dragging as presentation state only. The semantic records in `src/model.ts` remain authoritative for the artifact.

The tldraw tab is for local evaluation only. Shipping tldraw in production requires reviewing its current commercial SDK terms and license-key requirements.
