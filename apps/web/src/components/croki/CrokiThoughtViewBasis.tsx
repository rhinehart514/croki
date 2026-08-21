import type { CrokiThoughtView } from "@croki/contracts";

export function CrokiThoughtViewBasis(props: { readonly view: CrokiThoughtView }) {
  return (
    <aside className="border-b border-white/10 bg-zinc-950 px-5 py-4" aria-label="View basis">
      <div className="mx-auto grid w-full max-w-6xl gap-5 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <p className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">Representing</p>
          <p className="mt-1.5 text-[11px] leading-5 text-zinc-300">{props.view.basis.question}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">Foregrounds</p>
          <ul className="mt-1.5 space-y-1 text-[11px] leading-4 text-zinc-400">
            {props.view.basis.foregrounds.map((item) => (
              <li key={item}>— {item}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">Coverage</p>
          <p className="mt-1.5 text-[11px] leading-4 text-zinc-400">{props.view.basis.coverage}</p>
          {props.view.basis.omits.length > 0 ? (
            <p className="mt-2 text-[10px] leading-4 text-zinc-600">
              Omits {props.view.basis.omits.join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
