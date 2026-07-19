import { useEffect, useRef, useState } from "react";
import { Check, FolderOpen } from "lucide-react";
import {
  createVenture,
  listRepositoryChoices,
  type FirmVenture,
  type RepositoryChoice,
} from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function VentureCreateForm({
  ventures,
  id,
  onCreated,
}: {
  ventures: FirmVenture[];
  id?: string;
  onCreated: (venture: FirmVenture) => void;
}) {
  const [repositoryChoices, setRepositoryChoices] = useState<RepositoryChoice[] | null>(null);
  const [name, setName] = useState("");
  const [repository, setRepository] = useState("");
  const nameWasEdited = useRef(false);
  const [choosingRepository, setChoosingRepository] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const desktop = window.droverDesktop;

  useEffect(() => {
    if (desktop) return;
    let live = true;
    listRepositoryChoices()
      .then((res) => {
        if (!live) return;
        setRepositoryChoices(res.repositories);
        const connected = new Set(ventures.map((venture) => venture.repository));
        const available = res.repositories.filter((choice) => !connected.has(choice.path));
        const firstChoice = available.find((choice) => choice.source === "workspace") ?? available[0];
        setRepository((current) => available.some((choice) => choice.path === current) ? current : (firstChoice?.path ?? ""));
        if (!nameWasEdited.current) setName(firstChoice?.name ?? "");
      })
      .catch((cause) => {
        if (!live) return;
        setRepositoryChoices([]);
        setError(cause instanceof Error ? cause.message : "Could not load local product folders.");
      });
    return () => { live = false; };
  }, [desktop, ventures]);

  const connectedRepositories = new Set(ventures.map((venture) => venture.repository));
  const availableRepositoryChoices = repositoryChoices?.filter((choice) => !connectedRepositories.has(choice.path)) ?? null;

  const selectRepository = (choice: RepositoryChoice) => {
    const previousChoice = repositoryChoices?.find((candidate) => candidate.path === repository);
    setRepository(choice.path);
    setName((current) => !nameWasEdited.current || !current.trim() || current === previousChoice?.name ? choice.name : current);
    setError(null);
  };

  const chooseRepository = async () => {
    if (!desktop || choosingRepository) return;
    setChoosingRepository(true);
    setError(null);
    try {
      const selection = await desktop.selectRepository();
      if (!selection) return;
      setRepository(selection.path);
      setName((current) => !nameWasEdited.current || !current.trim() ? selection.name : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the folder chooser.");
    } finally {
      setChoosingRepository(false);
    }
  };

  const submit = async () => {
    const trimmed = name.trim();
    const trimmedRepository = repository.trim();
    if (!trimmed || !trimmedRepository || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { venture } = await createVenture(trimmed, trimmedRepository);
      onCreated(venture);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start that venture.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form id={id} aria-label="Start a venture" className="firm-app-picker-create" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <Input
        value={name}
        onChange={(event) => { setName(event.target.value); nameWasEdited.current = true; }}
        placeholder="Name a new venture"
        aria-label="New venture name"
      />
      {desktop ? (
        <button
          type="button"
          className="firm-app-repository-picker"
          onClick={() => { void chooseRepository(); }}
          disabled={choosingRepository}
        >
          <FolderOpen aria-hidden="true" />
          <span>
            <strong>{repository ? "Product folder selected" : "Choose product folder"}</strong>
            <small>{repository || "Select its repository on this Mac"}</small>
          </span>
          <em>{choosingRepository ? "Opening…" : repository ? "Change" : "Choose"}</em>
        </button>
      ) : (
        <fieldset className="firm-app-repository-choices">
          <legend>Product repository</legend>
          {availableRepositoryChoices === null ? (
            <p>Finding local product folders…</p>
          ) : availableRepositoryChoices.length ? (
            <div className="firm-app-repository-choice-list">
              {availableRepositoryChoices.map((choice) => {
                const selected = repository === choice.path;
                return (
                  <button
                    type="button"
                    key={choice.path}
                    className="firm-app-repository-choice"
                    aria-pressed={selected}
                    aria-label={`${selected ? "Selected" : "Use"} ${choice.name} product folder`}
                    onClick={() => selectRepository(choice)}
                  >
                    <FolderOpen aria-hidden="true" />
                    <span>
                      <strong>{choice.name}</strong>
                      <small>{choice.source === "workspace" ? "Current workspace" : "Connected venture"} · {choice.path}</small>
                    </span>
                    <em>{selected ? <><Check aria-hidden="true" /> Selected</> : "Use"}</em>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="firm-app-picker-connect-help"><strong>No repository is available yet.</strong> Open Drover from the product folder you want to connect, then return here. It will appear as a repository choice.</p>
          )}
          <small>One venture per product: repository context, parallel work, market returns, and founder decisions stay together.</small>
        </fieldset>
      )}
      {desktop || availableRepositoryChoices === null || availableRepositoryChoices.length ? (
        <Button type="submit" disabled={busy || !name.trim() || !repository.trim()}>{busy ? "Starting…" : "Start venture"}</Button>
      ) : null}
      {error ? <p role="alert" className="firm-app-picker-error">{error}</p> : null}
    </form>
  );
}
