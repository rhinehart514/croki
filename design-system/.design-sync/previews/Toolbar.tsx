import {
  Toolbar,
  Brand,
  ToolbarDivider,
  ToolbarSpacer,
  Button,
  Badge,
} from "@gtm-ide/design-system";

const Mark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M4 7h16M4 12h10M4 17h7" />
  </svg>
);

export function Default() {
  return (
    <Toolbar>
      <Brand mark={<Mark />}>GTM IDE</Brand>
      <ToolbarDivider />
      <span style={{ fontSize: 13, fontWeight: 620, color: "var(--ink-2)" }}>
        Buffalo-Projects
      </span>
      <ToolbarSpacer />
      <Badge tone="gap" caps>
        1 gate waiting
      </Badge>
      <Button size="sm">Deploy</Button>
    </Toolbar>
  );
}
