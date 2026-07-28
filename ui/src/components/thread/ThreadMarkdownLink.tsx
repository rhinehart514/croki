import { useEffect, useId, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { repositoryCitationFromHref } from "@/components/review/repositoryCitation";
import { requestRepositoryReview } from "@/components/work-mode/previewPresentation";

export function ThreadMarkdownLink({ href, children, className, title, repository, threadRef }: ComponentPropsWithoutRef<"a"> & {
  repository?: string;
  threadRef?: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const cancel = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const citation = repositoryCitationFromHref(href, repository);
  const linkClassName = ["thread-markdown-link", className].filter(Boolean).join(" ");

  useEffect(() => {
    if (!confirming) return undefined;
    cancel.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirming(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [confirming]);

  if (citation && threadRef) {
    return <button
      type="button"
      className={linkClassName}
      data-streamdown="link"
      role="link"
      title={title ?? `Open ${citation.path} in Review`}
      onClick={(event) => requestRepositoryReview(citation, { threadRef, source: event.currentTarget })}
    >{children}</button>;
  }

  return <>
    <button
      type="button"
      className={linkClassName}
      data-streamdown="link"
      role="link"
      title={title}
      onClick={() => setConfirming(true)}
    >{children}</button>
    {confirming ? <div className="thread-link-safety-backdrop" role="presentation" onMouseDown={() => setConfirming(false)}>
      <section className="thread-link-safety" role="alertdialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
        <strong id={titleId}>Open external link?</strong>
        <p>You're about to visit an external website.</p>
        <code>{href}</code>
        <div>
          <button ref={cancel} type="button" onClick={() => setConfirming(false)}>Cancel</button>
          <button type="button" onClick={() => {
            if (href && /^(?:https?:|mailto:)/i.test(href)) window.open(href, "_blank", "noopener,noreferrer");
            setConfirming(false);
          }}>Continue</button>
        </div>
      </section>
    </div> : null}
  </>;
}
