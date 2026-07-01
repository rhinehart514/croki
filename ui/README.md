# Drover interface

The canonical interface is a React, Tailwind, and React Flow local application.

Primary mode: a durable repository workspace that connects production-code
evidence to change-set review, approval, safe local apply or revert, and
verification history.

Secondary mode: an editable GTM flow library with per-node execution, founder
gates, connector states, and durable run history.

From the repository root:

```sh
npm start
```

Frontend-only checks:

```sh
npm --prefix ui run lint
npm --prefix ui run build
```
