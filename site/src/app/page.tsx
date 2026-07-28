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
              <h1 id="hero-title">Direct Claude and Codex without losing the thread.</h1>
              <p className="hero-lede">
                Croki is the founder-native coding environment where direct Claude and Codex
                work, exact Review, and source-backed product context stay in one durable Thread.
                Canvas appears when seeing the relationships will improve the next change.
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
                  See how it works
                </Button>
              </div>
              <p className="hero-note">
                Local desktop alpha. Works on the real repository with the model subscription
                you already use. You approve every consequential action.
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
              <strong>One outcome. One Thread.</strong>
            </div>
            <div className="proof-item">
              <Code2 />
              <span>Native Claude/Codex work</span>
            </div>
            <div className="proof-item">
              <CircleStop />
              <span>Founder-gated outward action</span>
            </div>
            <div className="proof-item">
              <TerminalSquare />
              <span>Evidence returns to the same Thread</span>
            </div>
          </section>

          <section className="loop-section" id="machine" aria-labelledby="loop-title">
            <div className="loop-heading">
              <InView>
                <p className="section-index">How it works</p>
                <h2 id="loop-title">Code here. Return here. Keep the context.</h2>
                <p>
                  Ordinary coding stays as direct and capable as a native coding client.
                  Croki earns its place by preserving the exact understanding that should
                  make the next dependent task better.
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
                <span className="wall-number">EXACT REVIEW</span>
                <h2 id="wall-title">
                  The agent changes the code. You judge the exact result.
                </h2>
                <p>
                  Diffs, files, previews, commands, and checks stay attached to the
                  Thread that produced them. Croki shows the material to inspect instead
                  of replacing it with workflow status, machine serialization, or a summary.
                </p>
                <p className="wall-maxim">The model works. You stay oriented.</p>
              </InView>
            </div>

            <InView className="approval-scene">
              <div className="approval-rail" aria-hidden="true">
                  <span>Exact material</span>
              </div>
              <article className="approval-card">
                <div className="approval-card-head">
                  <span className="approval-icon">
                    <LockKeyhole />
                  </span>
                  <span>
                    <small>Illustrative scenario · ready to review</small>
                    <strong>Fix the signup handoff</strong>
                  </span>
                  <Badge className="waiting-badge" variant="outline">
                    Waiting
                  </Badge>
                </div>
                <Separator />
                <dl className="effect-list">
                  <div>
                    <dt>Changed</dt>
                    <dd>3 files in one isolated worktree</dd>
                  </div>
                  <div>
                    <dt>Model</dt>
                    <dd>Claude Code · selected in this Thread</dd>
                  </div>
                  <div>
                    <dt>Proof</dt>
                    <dd>Unit checks and browser journey passed</dd>
                  </div>
                </dl>
                <div className="approval-receipt">
                  <Check />
                  <p>
                    The verification is attributed to this exact checkpoint. Product
                    interpretation remains separate from code proof.
                  </p>
                </div>
                <div className="approval-actions" aria-hidden="true">
                  <span>Keep working</span>
                  <span className="approve-button">Apply change</span>
                </div>
              </article>
            </InView>
          </section>

          <section className="principles-section" aria-labelledby="principles-title">
            <InView className="principles-heading">
              <p>What stays yours</p>
              <h2 id="principles-title">
                The agents get faster. Who’s in charge doesn’t change.
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
              <h2 id="local-title">Your machine. Your model. Your code.</h2>
              <p>
                Run the current alpha on your own machine. Your repository, worktrees,
                Threads, and project context stay local. Connect the Codex or Claude Code
                subscription you already use and start coding.
              </p>
              <ul className="local-checks">
                <li>
                  <Check /> Your repository and working state stay on your machine
                </li>
                <li>
                  <Check /> The model subscription you already have
                </li>
                <li>
                  <Check /> Only you approve consequential actions
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
          <p>Code with Claude and Codex without losing the thread.</p>
          <div>
            <a href={`${githubUrl}#run-locally`}>Setup</a>
            <a href={githubUrl}>Source</a>
          </div>
        </footer>
      </div>
    </>
  );
}
