import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleStop,
  Code2,
  LockKeyhole,
  TerminalSquare,
} from "lucide-react";
import { AnimatedGroup } from "@/components/motion-primitives/animated-group";
import { InView } from "@/components/motion-primitives/in-view";
import { MachineCanvas } from "@/components/machine-canvas";
import { CrokiMark, CrokiWordmark } from "@/components/croki-wordmark";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { githubUrl, loopSteps, principles } from "@/content/home";
import { ClosingSections } from "@/components/closing-sections";


export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="page-shell" id="top">
        <SiteHeader />

        <main id="main-content">
          <section className="hero" aria-labelledby="hero-title">
            <AnimatedGroup className="hero-copy">
              <Badge className="alpha-badge" variant="outline">
                <span className="live-dot" aria-hidden="true" />
                Local-first alpha
              </Badge>
              <h1 id="hero-title">Move faster than the market can react.</h1>
              <p className="hero-lede">
                Change the Product and every path to market while Claude and Codex
                pursue several approaches, learn from reality, and make your next move faster.
              </p>
              <div className="hero-actions">
                <Button
                  className="primary-cta"
                  size="lg"
                  render={<a href={`${githubUrl}#run-locally`} />}
                >
                  Run Croki locally
                  <ArrowRight data-icon="inline-end" />
                </Button>
                <Button
                  className="secondary-cta"
                  variant="outline"
                  size="lg"
                  render={<a href="#machine" />}
                >
                  See the loop
                </Button>
              </div>
              <p className="hero-note">
                Local desktop alpha. Native Claude/Codex work, durable Product alternatives,
                and exact founder authority over current truth and the outside world.
              </p>
            </AnimatedGroup>

            <AnimatedGroup className="hero-visual">
              <MachineCanvas />
            </AnimatedGroup>
          </section>

          <section className="proof-band" aria-label="Croki operating principles">
            <div className="proof-intro">
              <span className="proof-mark" aria-hidden="true">
                <CrokiMark />
              </span>
              <strong>One founder. Many approaches. One coherent changing venture.</strong>
            </div>
            <div className="proof-item">
              <Code2 />
              <span>Product models can change</span>
            </div>
            <div className="proof-item">
              <CircleStop />
              <span>Unscalable work is first-class</span>
            </div>
            <div className="proof-item">
              <TerminalSquare />
              <span>Codex and Claude, locally</span>
            </div>
          </section>

          <section className="loop-section" id="machine" aria-labelledby="loop-title">
            <div className="loop-heading">
              <InView>
                <p className="section-index">The product being built</p>
                <h2 id="loop-title">Every useful cycle improves the next move.</h2>
                <p>
                  Direct exact work, let several Product and market alternatives develop,
                  cross into the world under your hand, and bring reality back to the claims it can change.
                </p>
              </InView>
            </div>

            <div className="loop-list">
              {loopSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <InView className="loop-row" key={step.number}>
                    <span className="loop-number">{step.number}</span>
                    <span className="loop-icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <div className="loop-copy">
                      <h3>{step.title}</h3>
                      <p>{step.body}</p>
                    </div>
                    <span className="loop-detail">{step.detail}</span>
                  </InView>
                );
              })}
            </div>
          </section>

          <section className="wall-section" id="wall" aria-labelledby="wall-title">
            <div className="wall-copy">
              <InView>
                <span className="wall-number">EXACT CONSEQUENCE / NEEDS YOU</span>
                <h2 id="wall-title">
                  Capability expands. Authority stays yours.
                </h2>
                <p>
                  Claude and Codex can research, build, and verify inside your
                  direction. The moment work would send, publish, deploy, spend,
                  destroy, or materially rewrite ambiguous venture truth, Croki
                  presents the exact consequence for your call.
                </p>
                <p className="wall-maxim">The system prepares. The founder decides.</p>
              </InView>
            </div>

            <InView className="approval-scene">
              <div className="approval-rail" aria-hidden="true">
                <span>Nothing leaves</span>
              </div>
              <article className="approval-card">
                <div className="approval-card-head">
                  <span className="approval-icon">
                    <LockKeyhole />
                  </span>
                  <span>
                    <small>Illustrative scenario · founder consequence</small>
                    <strong>Publish launch artifact</strong>
                  </span>
                  <Badge className="waiting-badge" variant="outline">
                    Waiting
                  </Badge>
                </div>
                <Separator />
                <dl className="effect-list">
                  <div>
                    <dt>Destination</dt>
                    <dd>scaffoldweb.com</dd>
                  </div>
                  <div>
                    <dt>Prepared by</dt>
                    <dd>Claude Code · verified run</dd>
                  </div>
                  <div>
                    <dt>Changes</dt>
                    <dd>1 public page, 0 paid actions</dd>
                  </div>
                </dl>
                <div className="approval-receipt">
                  <Check />
                  <p>
                    Claims linked to cited repository evidence. Preview and
                    rollback path are ready.
                  </p>
                </div>
                <div className="approval-actions" aria-hidden="true">
                  <span>Keep staged</span>
                  <span className="approve-button">Publish artifact</span>
                </div>
              </article>
            </InView>
          </section>

          <section className="principles-section" aria-labelledby="principles-title">
            <InView className="principles-heading">
              <p>What stays yours</p>
              <h2 id="principles-title">
                Better models can arrive. The durable parts should remain.
              </h2>
            </InView>

            <div className="principles-list">
              {principles.map((principle) => {
                const Icon = principle.icon;
                return (
                  <InView className="principle-row" key={principle.number}>
                    <span className="principle-number">{principle.number}</span>
                    <span className="principle-icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <h3>{principle.title}</h3>
                    <p>{principle.body}</p>
                  </InView>
                );
              })}
            </div>
          </section>

          <section className="local-section" id="local" aria-labelledby="local-title">
            <InView className="local-copy">
              <Badge className="source-badge" variant="outline">
                Source available
              </Badge>
              <h2 id="local-title">Your machine. Your model. Your state.</h2>
              <p>
                Run the current alpha on your own machine. Canonical venture state
                and repository truth stay local. Connect Codex or Claude Code when
                you direct research, design, implementation, or verification.
              </p>
              <ul className="local-checks">
                <li>
                  <Check /> Local product and working state
                </li>
                <li>
                  <Check /> Existing model subscription
                </li>
                <li>
                  <Check /> Founder-only consequence authority
                </li>
              </ul>
            </InView>

            <InView className="terminal-window">
              <div className="terminal-bar">
                <span className="terminal-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span>Run Croki</span>
                <span>zsh</span>
              </div>
              <pre>
                <code>
                  <span className="terminal-comment"># from the Croki repo</span>
                  {"\n"}
                  <span className="terminal-prompt">$</span> npm install
                  {"\n"}
                  <span className="terminal-prompt">$</span> npm run app
                  {"\n\n"}
                  <span className="terminal-success">✓</span> Croki desktop is opening
                  {"\n"}  Electron + local Brain
                </code>
              </pre>
              <div className="terminal-footer">
                <span>Node.js + Git required</span>
                <a href={`${githubUrl}#run-locally`}>
                  Read setup <ArrowUpRight />
                </a>
              </div>
            </InView>
          </section>

          <ClosingSections />
        </main>

        <footer className="site-footer">
          <a href="#top" aria-label="Back to top">
            <CrokiWordmark />
          </a>
          <p>The founder-controlled Product and go-to-market system.</p>
          <div>
            <a href={`${githubUrl}#run-locally`}>Setup</a>
            <a href={githubUrl}>Source</a>
          </div>
        </footer>
      </div>
    </>
  );
}
