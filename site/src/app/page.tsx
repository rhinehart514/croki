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
              <h1 id="hero-title">You built it. Now get people using it.</h1>
              <p className="hero-lede">
                You can already build. That was never the problem. Croki takes what you
                shipped to its first real users, brings back what they do, and turns it
                into your next move. Nothing goes out without your say-so.
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
                Local desktop alpha. Works on the real repo you build with Claude or Codex.
                You approve every message, deploy, and change before it reaches the world.
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
              <strong>Building was never your problem. Getting used is.</strong>
            </div>
            <div className="proof-item">
              <Code2 />
              <span>Reaches your first real users</span>
            </div>
            <div className="proof-item">
              <CircleStop />
              <span>Nothing sends without your say-so</span>
            </div>
            <div className="proof-item">
              <TerminalSquare />
              <span>Runs on Claude and Codex, locally</span>
            </div>
          </section>

          <section className="loop-section" id="machine" aria-labelledby="loop-title">
            <div className="loop-heading">
              <InView>
                <p className="section-index">How it works</p>
                <h2 id="loop-title">From shipped to actually used.</h2>
                <p>
                  Croki reads the product you already built, finds a grounded way to reach
                  the people it's for, sends only what you approve, and brings back what they
                  do so you know what to build next.
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
                <span className="wall-number">NEEDS YOU</span>
                <h2 id="wall-title">
                  Agents do the reach-out. You approve every send.
                </h2>
                <p>
                  Claude and Codex research who your product is for and draft the
                  outreach, the post, or the deploy. The moment anything would reach a
                  real person, go live, or spend a dollar, Croki stops and shows you
                  exactly what it is, for your call.
                </p>
                <p className="wall-maxim">The agent prepares. You decide.</p>
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
                    <small>Illustrative scenario · needs your call</small>
                    <strong>Send intro to 8 people</strong>
                  </span>
                  <Badge className="waiting-badge" variant="outline">
                    Waiting
                  </Badge>
                </div>
                <Separator />
                <dl className="effect-list">
                  <div>
                    <dt>Who</dt>
                    <dd>8 people who starred your repo</dd>
                  </div>
                  <div>
                    <dt>Drafted by</dt>
                    <dd>Claude Code · one message each</dd>
                  </div>
                  <div>
                    <dt>Effect</dt>
                    <dd>8 emails, 0 dollars spent</dd>
                  </div>
                </dl>
                <div className="approval-receipt">
                  <Check />
                  <p>
                    Every message names a real detail from that person. You can read
                    all 8 before any of them send.
                  </p>
                </div>
                <div className="approval-actions" aria-hidden="true">
                  <span>Keep staged</span>
                  <span className="approve-button">Send 8</span>
                </div>
              </article>
            </InView>
          </section>

          <section className="principles-section" aria-labelledby="principles-title">
            <InView className="principles-heading">
              <p>What stays yours</p>
              <h2 id="principles-title">
                The agents get faster. Who's in charge doesn't change.
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
              <h2 id="local-title">Your machine. Your model. Your users.</h2>
              <p>
                Run the current alpha on your own machine. Your product, your repo, and
                everyone you reach stay local to you. Connect the Codex or Claude Code
                subscription you already pay for and start.
              </p>
              <ul className="local-checks">
                <li>
                  <Check /> Your product and contacts stay on your machine
                </li>
                <li>
                  <Check /> The model subscription you already have
                </li>
                <li>
                  <Check /> Only you approve what goes out
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
          <p>You built it. Croki gets it used. You approve everything that ships.</p>
          <div>
            <a href={`${githubUrl}#run-locally`}>Setup</a>
            <a href={githubUrl}>Source</a>
          </div>
        </footer>
      </div>
    </>
  );
}
