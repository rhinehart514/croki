import { SegmentedTabs } from "@gtm-ide/design-system";

const Build = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="m7 8-4 4 4 4M17 8l4 4-4 4" />
  </svg>
);

export function Modes() {
  return (
    <SegmentedTabs
      value="run"
      onValueChange={() => {}}
      items={[
        { value: "build", label: "Build" },
        { value: "run", label: "Run" },
        { value: "measure", label: "Measure" },
      ]}
    />
  );
}

export function WithIcons() {
  return (
    <SegmentedTabs
      value="build"
      onValueChange={() => {}}
      items={[
        { value: "build", label: "Build", icon: <Build /> },
        { value: "run", label: "Run" },
        { value: "measure", label: "Measure" },
      ]}
    />
  );
}
