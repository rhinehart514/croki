# Runtime modes

Croki has a runtime access switch in the chat toolbar:

- **Full access** (default): starts sessions with `approvalPolicy: never` and `sandboxMode: danger-full-access`.
- **Supervised**: starts sessions with `approvalPolicy: on-request` and `sandboxMode: workspace-write`, then prompts in-app for command/file approvals.

Access mode is not a harness. It controls permissions and approvals, not the
agent's persona, planning behavior, delegation policy, or task strategy.

The selected harness model is separate and is not yet shipped as a selector:

- **Native** is the default and adds no Croki behavioral policy.
- A named harness such as **GTM** may be explicitly enabled for one turn or
  Thread and must remain visible and reversible.
