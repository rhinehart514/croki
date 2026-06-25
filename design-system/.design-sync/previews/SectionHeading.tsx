import { SectionHeading } from "@gtm-ide/design-system";

const Outcomes = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const Problems = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

export function Headings() {
  return (
    <div style={{ display: "grid", gap: 16, width: 240 }}>
      <SectionHeading icon={<Outcomes />}>Outcomes</SectionHeading>
      <SectionHeading icon={<Problems />}>Problems</SectionHeading>
      <SectionHeading>Connectors</SectionHeading>
    </div>
  );
}
