import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import {
  createVenture,
  listRepositoryChoices,
  type FirmVenture,
  type RepositoryChoice,
} from "@/api";

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
  const [choosingRepository, setChoosingRepository] = useState(false);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const desktop = window.droverDesktop;

  useEffect(() => {
    if (desktop) return;
    let live = true;
    listRepositoryChoices()
      .then((response) => { if (live) setRepositoryChoices(response.repositories); })
      .catch(() => {
        if (!live) return;
        setRepositoryChoices([]);
        setError("Croki could not read local codebases from this window. Use the desktop app or reopen Croki from the folder you want to add.");
      });
    return () => { live = false; };
  }, [desktop]);

  const connectedRepositories = new Set(ventures.map((venture) => venture.repository));
  const availableRepositoryChoices = repositoryChoices?.filter((choice) => !connectedRepositories.has(choice.path)) ?? null;

  const addRepository = async (selection: { path: string; name: string }) => {
    if (busyPath) return;
    const existing = ventures.find((venture) => venture.repository === selection.path);
    if (existing) {
      onCreated(existing);
      return;
    }
    setBusyPath(selection.path);
    setError(null);
    try {
      const { venture } = await createVenture(selection.name, selection.path);
      onCreated(venture);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add that codebase.");
      setBusyPath(null);
    }
  };

  const chooseRepository = async () => {
    if (!desktop || choosingRepository || busyPath) return;
    setChoosingRepository(true);
    setError(null);
    try {
      const selection = await desktop.selectRepository();
      if (selection) await addRepository(selection);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the folder chooser.");
    } finally {
      setChoosingRepository(false);
    }
  };

  return (
    <section id={id} aria-label="Add a codebase" className="firm-app-picker-create">
      {desktop ? (
        <button
          type="button"
          className="firm-app-repository-picker"
          onClick={() => { void chooseRepository(); }}
          disabled={choosingRepository || Boolean(busyPath)}
        >
          <FolderOpen aria-hidden="true" />
          <span>
            <strong>{busyPath ? "Adding codebase…" : choosingRepository ? "Choose a folder" : "Choose a codebase"}</strong>
            <small>{busyPath ?? "Croki reads it locally, then opens Work"}</small>
          </span>
          <em>{busyPath ? "Adding…" : choosingRepository ? "Opening…" : "Choose"}</em>
        </button>
      ) : (
        <fieldset className="firm-app-repository-choices">
          <legend>Choose a codebase</legend>
          {availableRepositoryChoices === null ? (
            <p>Finding local codebases…</p>
          ) : availableRepositoryChoices.length ? (
            <div className="firm-app-repository-choice-list">
              {availableRepositoryChoices.map((choice) => (
                <button
                  type="button"
                  key={choice.path}
                  className="firm-app-repository-choice"
                  aria-label={`Add ${choice.name} codebase`}
                  disabled={Boolean(busyPath)}
                  onClick={() => { void addRepository(choice); }}
                >
                  <FolderOpen aria-hidden="true" />
                  <span>
                    <strong>{choice.name}</strong>
                    <small>{choice.source === "workspace" ? "Current workspace" : "Connected product"} · {choice.path}</small>
                  </span>
                  <em>{busyPath === choice.path ? "Adding…" : "Add"}</em>
                </button>
              ))}
            </div>
          ) : (
            <p className="firm-app-picker-connect-help"><strong>No codebase is available yet.</strong> Open Croki from the product folder you want to add, then return here.</p>
          )}
          <small>The folder name becomes the product name. You can start directing work as soon as it opens.</small>
        </fieldset>
      )}
      {error ? <p role="alert" className="firm-app-picker-error">{error}</p> : null}
    </section>
  );
}
