import { useState, type ReactNode } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronLeft, ChevronRight, Sparkles, TerminalSquare, ScanSearch } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Project = { name: string; repo: string; product: number; gtm: number; q: string };

const PROJECTS: Project[] = [
  { name: "Buffalo Projects", repo: "~/Buffalo-Projects", product: 0.6, gtm: 0.25, q: "Can't tell what creates active projects yet." },
  { name: "RodentRadar", repo: "~/rodentradar", product: 0.45, gtm: 0.15, q: "Buyer still unclear — pilot not signed." },
  { name: "Nursing Sim", repo: "~/nursing", product: 0.3, gtm: 0.1, q: "Scenario eval not defined." },
  { name: "Venture", repo: "~/venture", product: 0.5, gtm: 0.2, q: "Not yet run live on a real venture." },
];

function ringColor(v: number) {
  if (v < 0.34) return "var(--destructive)";
  if (v < 0.67) return "var(--gap)";
  return "var(--proven)";
}

function Ring({ label, value }: { label: string; value: number }) {
  const c = 2 * Math.PI * 15;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="38" height="38">
        <circle cx="19" cy="19" r="15" fill="none" stroke="var(--muted)" strokeWidth="4" />
        <circle
          cx="19" cy="19" r="15" fill="none" stroke={ringColor(value)} strokeWidth="4"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value)}
          transform="rotate(-90 19 19)"
        />
      </svg>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function Home({ onOpen }: { onOpen: (p: Project) => void }) {
  return (
    <div className="h-screen overflow-auto p-8">
      <h1 className="text-2xl font-bold tracking-tight">Your projects</h1>
      <p className="text-sm text-muted-foreground mt-0.5">
        Product + GTM health across everything you're building
      </p>
      <div className="mt-6 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {PROJECTS.map((p) => (
          <Card
            key={p.name}
            onClick={() => onOpen(p)}
            className="cursor-pointer transition-transform hover:-translate-y-0.5 hover:shadow-md"
          >
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{p.name}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </div>
              <div className="flex gap-5 my-3">
                <Ring label="product" value={p.product} />
                <Ring label="gtm" value={p.gtm} />
              </div>
              <p className="text-sm text-muted-foreground">{p.q}</p>
              <p className="mt-2 font-mono text-[10px] text-muted-foreground/70">{p.repo}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StageNode({ data }: { data: { label: string; state: string } }) {
  const tone =
    data.state === "proven" ? "text-proven" : data.state === "gap" ? "text-gap" : "text-blind";
  return (
    <div
      className={cn(
        "rounded-lg border bg-card px-4 py-3 text-center shadow-sm min-w-[96px]",
        data.state === "gap" && "border-gap ring-2 ring-gap/25",
      )}
    >
      <Handle type="target" position={Position.Left} style={{ background: "var(--muted-foreground)" }} />
      <div className="text-sm font-medium">{data.label}</div>
      <div className={cn("mt-0.5 text-[10px] uppercase tracking-wide", tone)}>{data.state}</div>
      <Handle type="source" position={Position.Right} style={{ background: "var(--muted-foreground)" }} />
    </div>
  );
}

const nodeTypes = { stage: StageNode };

const funnelNodes: Node[] = [
  { id: "source", type: "stage", position: { x: 0, y: 80 }, data: { label: "source", state: "proven" } },
  { id: "signup", type: "stage", position: { x: 175, y: 80 }, data: { label: "signup", state: "proven" } },
  { id: "activation", type: "stage", position: { x: 350, y: 80 }, data: { label: "activation", state: "gap" } },
  { id: "return", type: "stage", position: { x: 525, y: 80 }, data: { label: "return", state: "blind" } },
];
const funnelEdges: Edge[] = [
  { id: "e1", source: "source", target: "signup" },
  { id: "e2", source: "signup", target: "activation", animated: true, label: "source_id lost", style: { stroke: "var(--gap)" } },
  { id: "e3", source: "activation", target: "return" },
];

function Segmented({ mode, setMode }: { mode: string; setMode: (m: "product" | "gtm") => void }) {
  const item = (key: "product" | "gtm", label: string) => (
    <button
      onClick={() => setMode(key)}
      className={cn(
        "rounded-md px-4 py-1 text-[13px] font-medium transition-colors",
        mode === key ? "bg-card shadow-sm" : "text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex gap-0.5 rounded-lg bg-secondary p-0.5">
      {item("product", "Product Strategy")}
      {item("gtm", "GTM")}
    </div>
  );
}

function Panel({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 p-3.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function Workbench({ p, onBack }: { p: Project; onBack: () => void }) {
  const [mode, setMode] = useState<"product" | "gtm">("gtm");
  return (
    <div className="flex h-screen flex-col">
      <div className="flex h-13 items-center gap-3 border-b px-4 py-2.5">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-primary">
          <ChevronLeft className="size-4" /> Projects
        </Button>
        <span className="font-semibold">{p.name}</span>
        <div className="flex-1" />
        <Segmented mode={mode} setMode={setMode} />
        <div className="flex-1" />
        <span className="font-mono text-[11px] text-muted-foreground">{p.repo}</span>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-72 border-r">
          <Panel icon={<Sparkles className="size-3.5" />} title="Agent">
            <div className="rounded-lg border bg-card p-2.5 text-[13px]">
              Found Buffalo's attribution: <code>ref</code> on the join screen. Tracing whether it
              reaches the win event…
            </div>
            <div className="rounded-lg border bg-card p-2.5 text-[13px]">
              Captured at signup but <b>dropped before project_created</b> — that's why you can't
              tell what creates active projects.
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1">
            <ReactFlow
              nodes={funnelNodes}
              edges={funnelEdges}
              nodeTypes={nodeTypes}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={22} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
          <div className="h-36 border-t">
            <Panel icon={<TerminalSquare className="size-3.5" />} title="Console">
              <code className="text-[12px] text-muted-foreground">
                &gt; mirror ~/Buffalo-Projects · analytics WIRED (PostHog, Segment, GA) ·
                ref@join/screen.tsx:88
              </code>
            </Panel>
          </div>
        </div>

        <div className="w-80 border-l">
          <Panel icon={<ScanSearch className="size-3.5" />} title="Activation">
            <p className="text-[13px] leading-relaxed">
              Projects are created, but <b>source isn't carried onto them</b> — every channel claim
              is blind.
            </p>
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                join key: source_id
              </span>
              <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                cite: join/screen.tsx:88
              </span>
            </div>
            <Button className="mt-1 w-full">Build the fix with Claude</Button>
          </Panel>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [open, setOpen] = useState<Project | null>(null);
  return open ? <Workbench p={open} onBack={() => setOpen(null)} /> : <Home onOpen={setOpen} />;
}
