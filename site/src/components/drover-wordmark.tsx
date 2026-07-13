export function DroverWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="wordmark">
      <span className="wordmark-mark" aria-hidden="true">
        <span />
      </span>
      {!compact && <span>Drover</span>}
    </span>
  );
}
