import { GitBranch, Globe2 } from "lucide-react";
import type { WorkflowCapability } from "./workflowCapabilities";

export function CapabilityLogo({ capability, size = 28 }: { capability: WorkflowCapability; size?: number }) {
  const style = { width: size, height: size };
  if (capability.provider === "gmail") return <svg className="capability-logo" style={style} viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M2.4 6.2 12 13.4v8.1H4.2c-1 0-1.8-.8-1.8-1.8V6.2Z"/><path fill="#34A853" d="M21.6 6.2v13.5c0 1-.8 1.8-1.8 1.8H12v-8.1l9.6-7.2Z"/><path fill="#EA4335" d="M21.6 4.9v1.3L12 13.4 2.4 6.2V4.9c0-1.8 2.1-2.8 3.5-1.7L12 7.8l6.1-4.6c1.4-1.1 3.5-.1 3.5 1.7Z"/><path fill="#FBBC04" d="M2.4 6.2 6.6 9.4v12.1H4.2c-1 0-1.8-.8-1.8-1.8V6.2Z"/><path fill="#C5221F" d="m17.4 9.4 4.2-3.2v13.5c0 1-.8 1.8-1.8 1.8h-2.4V9.4Z"/></svg>;
  if (capability.provider === "exa") return <svg className="capability-logo capability-logo--exa" style={style} viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14l-5.1 8L19 20H5l5.1-8L5 4Z" fill="currentColor"/></svg>;
  if (capability.id === "repository") return <GitBranch className="capability-logo" style={style} aria-hidden="true" />;
  if (capability.id === "browser") return <Globe2 className="capability-logo" style={style} aria-hidden="true" />;
  return <span className="capability-logo capability-logo--monogram" style={style} aria-hidden="true">{capability.label.slice(0, 1)}</span>;
}
