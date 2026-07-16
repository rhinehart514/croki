import { useEffect, useRef, useState } from "react";
import { Download, FileJson, FolderOpen, Upload } from "lucide-react";
import {
  exportVentureTransfer,
  importVentureTransfer,
  listRepositoryChoices,
  type FirmVenture,
  type RepositoryChoice,
  type VentureTransferFile,
  type VentureTransferReceipt,
} from "@/api";
import { Button } from "@/components/ui/button";

const MAX_TRANSFER_BYTES = 20 * 1024 * 1024;

function saveTransfer(transfer: VentureTransferFile) {
  const slug = transfer.venture.manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "venture";
  const url = URL.createObjectURL(new Blob([JSON.stringify(transfer, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slug}.drover.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function VentureTransfer({ ventures, onImported }: {
  ventures: FirmVenture[];
  onImported: (venture: FirmVenture, receipt: VentureTransferReceipt) => void;
}) {
  const [choices, setChoices] = useState<RepositoryChoice[]>([]);
  const [repository, setRepository] = useState("");
  const [transfer, setTransfer] = useState<VentureTransferFile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<VentureTransferReceipt | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const desktop = window.droverDesktop;

  useEffect(() => {
    if (desktop) return;
    let live = true;
    listRepositoryChoices().then(({ repositories }) => {
      if (!live) return;
      const connected = new Set(ventures.map((venture) => venture.repository));
      const available = repositories.filter((choice) => !connected.has(choice.path));
      setChoices(available);
      setRepository((current) => current || available[0]?.path || "");
    }).catch(() => { if (live) setChoices([]); });
    return () => { live = false; };
  }, [desktop, ventures]);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setReceipt(null);
    if (file.size > MAX_TRANSFER_BYTES) return setError("That transfer file is larger than 20 MB.");
    try {
      const parsed = JSON.parse(await file.text()) as VentureTransferFile;
      if (parsed.format !== "drover-venture-transfer" || parsed.version !== 1) throw new Error("This is not a supported Drover venture transfer file.");
      setTransfer(parsed);
    } catch (cause) {
      setTransfer(null);
      setError(cause instanceof Error ? cause.message : "Could not read that transfer file.");
    }
  };

  const chooseRepository = async () => {
    try {
      const selected = await desktop?.selectRepository();
      if (selected) setRepository(selected.path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not choose that product folder.");
    }
  };

  const exportOne = async (venture: FirmVenture) => {
    setBusy(`export:${venture.id}`);
    setError(null);
    try {
      const { transfer: exported } = await exportVentureTransfer(venture.id);
      saveTransfer(exported);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not export that venture.");
    } finally { setBusy(null); }
  };

  const importOne = async () => {
    if (!transfer || !repository || busy) return;
    setBusy("import");
    setError(null);
    try {
      const result = await importVentureTransfer(transfer, repository);
      setReceipt(result.receipt);
      onImported(result.venture, result.receipt);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import that venture.");
    } finally { setBusy(null); }
  };

  return (
    <section className="venture-transfer" aria-labelledby="venture-transfer-title">
      <header><FileJson aria-hidden="true" /><div><h3 id="venture-transfer-title">Move a venture</h3><p>Durable work travels. Provider sessions resume cold; product-change worktrees must be recreated.</p></div></header>
      <div className="venture-transfer-export" aria-label="Export a venture">
        {ventures.map((venture) => (
          <button key={venture.id} type="button" disabled={busy !== null} onClick={() => { void exportOne(venture); }}>
            <span><strong>{venture.name}</strong><small>Portable JSON · machine paths stripped</small></span>
            <em><Download aria-hidden="true" /> {busy === `export:${venture.id}` ? "Preparing…" : "Export"}</em>
          </button>
        ))}
      </div>
      <div className="venture-transfer-import">
        <input ref={inputRef} type="file" accept=".json,.drover.json,application/json" aria-label="Choose a Drover venture transfer file" onChange={(event) => { void readFile(event.target.files?.[0]); }} />
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}><Upload aria-hidden="true" /> {transfer ? transfer.venture.manifest.name : "Choose transfer file"}</Button>
        {desktop ? (
          <Button type="button" variant="outline" onClick={() => { void chooseRepository(); }}><FolderOpen aria-hidden="true" /> {repository ? "Destination selected" : "Bind destination repository"}</Button>
        ) : (
          <label><span>Destination repository</span><select value={repository} onChange={(event) => setRepository(event.target.value)}><option value="">Choose a product folder</option>{choices.map((choice) => <option key={choice.path} value={choice.path}>{choice.name} · {choice.path}</option>)}</select></label>
        )}
        <Button type="button" disabled={!transfer || !repository || busy !== null} onClick={() => { void importOne(); }}>{busy === "import" ? "Rebinding…" : "Import and rebind"}</Button>
      </div>
      {repository ? <p className="venture-transfer-path">Destination · {repository}</p> : null}
      {receipt ? <p className="venture-transfer-receipt" role="status">Rebound. Provider resume is cold{receipt.productChangeWorktrees === "refork-required" ? "; retained product changes need a new worktree" : ""}.</p> : null}
      {error ? <p className="venture-transfer-error" role="alert">{error}</p> : null}
    </section>
  );
}
