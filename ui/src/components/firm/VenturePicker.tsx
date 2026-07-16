import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, FolderOpen, Plus } from "lucide-react";
import {
  createVenture,
  listRepositoryChoices,
  listVentures,
  type FirmVenture,
  type PortfolioWallContext,
  type RepositoryChoice,
} from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PortfolioFrontier } from "./PortfolioFrontier";

export function VenturePicker({ onOpen }: {
  onOpen: (venture: FirmVenture, context?: PortfolioWallContext) => void;
}) {
  const [ventures, setVentures] = useState<FirmVenture[] | null>(null);
  const [repositoryChoices, setRepositoryChoices] = useState<RepositoryChoice[] | null>(null);
  const [name, setName] = useState("");
  const [repository, setRepository] = useState("");
  const nameWasEdited = useRef(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [choosingRepository, setChoosingRepository] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const desktop = window.droverDesktop;

  useEffect(() => {
    let live = true;
    listVentures().then((res) => { if (live) setVentures(res.ventures); }).catch(() => { if (live) setVentures([]); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (desktop || ventures === null) return;
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

  const connectedRepositories = new Set((ventures ?? []).map((venture) => venture.repository));
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
      onOpen(venture);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start that venture.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="firm-app-picker">
      <div className="firm-app-picker-head">
        <span>One-person holding company</span>
        <h1>Drover</h1>
        <p>Direct every venture, see what moved, and review consequential changes before they leave.</p>
        <div className="firm-app-picker-orbit" aria-hidden="true">
          <i /><i /><i />
          <strong>{ventures === null ? "Opening the firm" : `${ventures.length} ${ventures.length === 1 ? "venture" : "ventures"}`}</strong>
          <small>one firm</small>
        </div>
      </div>

      <div className="firm-app-picker-content">
        {ventures === null ? (
          <p className="firm-app-picker-loading">Loading your ventures…</p>
        ) : ventures.length === 0 ? (
          <section className="firm-app-picker-section" aria-labelledby="start-first-venture">
            <div className="firm-app-picker-section-head">
              <h2 id="start-first-venture">Start your first venture</h2>
              <p>Connect the product repository Drover should work inside.</p>
            </div>
            {renderCreateForm()}
          </section>
        ) : (
          <>
          <section className="firm-app-picker-section firm-app-picker-continue" aria-labelledby="continue-venture">
            <div className="firm-app-picker-section-head">
              <h2 id="continue-venture">Continue a venture</h2>
              <p>Open the live canvas for that product.</p>
            </div>
            <ul className="firm-app-picker-list">
              {ventures.map((venture) => (
                <li key={venture.id}>
                  <button type="button" onClick={() => onOpen(venture)}>
                    <span>
                      <strong>{venture.name}</strong>
                      <small>Product repository · {venture.repository.split("/").filter(Boolean).at(-1) ?? "connected"}</small>
                    </span>
                    <em>Open canvas <ArrowRight aria-hidden="true" /></em>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="firm-app-picker-new" aria-labelledby="start-another-venture">
            <button
              type="button"
              className="firm-app-picker-new-toggle"
              aria-expanded={createOpen}
              aria-controls={createOpen ? "new-venture-form" : undefined}
              onClick={() => setCreateOpen((open) => !open)}
            >
              <Plus aria-hidden="true" />
              <span>
                <strong id="start-another-venture">Start another venture</strong>
                <small>Connect a different product repository as a separate venture.</small>
              </span>
              <ChevronDown aria-hidden="true" />
            </button>
            {createOpen ? renderCreateForm("new-venture-form") : null}
          </section>

          <PortfolioFrontier ventures={ventures} onOpen={onOpen} />
          </>
        )}

        {error ? <p role="alert" className="firm-app-picker-error">{error}</p> : null}
      </div>
    </div>
  );

  function renderCreateForm(id?: string) {
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
      </form>
    );
  }
}
