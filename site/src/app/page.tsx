import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  CircleStop,
  Code2,
  FileCheck2,
  GitFork,
  LockKeyhole,
  MousePointer2,
  Plug,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { AnimatedGroup } from "@/components/motion-primitives/animated-group";
import { InView } from "@/components/motion-primitives/in-view";
import { MachineCanvas } from "@/components/machine-canvas";
import { DroverWordmark } from "@/components/drover-wordmark";
import { SiteHeader } from "@/components/site-header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const githubUrl = "https://github.com/rhinehart514/drover";
const defaultFaqValue = ["item-0"];

const loopSteps = [
  {
    number: "01",
    icon: ScanSearch,
    title: "See the whole venture",
    body: "Drover is being built to keep Product and go-to-market visible as distinct territories in one canonical model, with unsupported claims and missing links exposed.",
    detail: "One model",
  },
  {
    number: "02",
    icon: MousePointer2,
    title: "Point at what should change",
    body: "The current alpha can focus available canvas objects and related work. One durable conversation with persistent scoped branches is still being unified.",
    detail: "Context stays intact",
  },
  {
    number: "03",
    icon: Sparkles,
    title: "Expand what you can accomplish",
    body: "Claude and Codex research, build, compare, and verify inside the founder's direction. Their work stays inspectable instead of becoming an org chart.",
    detail: "Bounded execution",
  },
  {
    number: "04",
    icon: LockKeyhole,
    title: "Hold the exact consequence",
    body: "Sending, publishing, deploying, spending, destructive change, and ambiguous canonical truth remain under the founder's explicit hand.",
    detail: "Authority stays yours",
  },
  {
    number: "05",
    icon: CheckCircle2,
    title: "Let evidence change understanding",
    body: "Returned outcomes keep their source and attribution. Founder-applied evidence can support or challenge the relevant understanding without claiming causation.",
    detail: "Learning stays visible",
  },
];

const principles = [
  {
    number: "I",
    icon: FileCheck2,
    title: "Facts, evidence, and interpretation stay separate.",
    body: "Repository truth remains cited, measured returns keep their source, and Claude or Codex interpretations stay visibly provisional.",
  },
  {
    number: "II",
    icon: ShieldCheck,
    title: "Founder direction must begin every run.",
    body: "That is the governing requirement. Direct founder-driven work exists today; legacy founder-enabled heat can still wake work unattended, and outcome-contract workflows are not yet implemented.",
  },
  {
    number: "III",
    icon: Sparkles,
    title: "Every consequence stays under your hand.",
    body: "Safe inward work can move quickly, but exact world-boundary actions and ambiguous canonical changes remain yours.",
  },
];

const pricingLines = [
  {
    number: "01",
    icon: Code2,
    title: "The software",
    body: "Clone the source and run the current alpha. There is no Drover license or seat fee today.",
    detail: "$0 to Drover",
  },
  {
    number: "02",
    icon: TerminalSquare,
    title: "Your machine",
    body: "Drover runs on your own macOS or Linux box with Node.js and Git. Your product and working state stay local.",
    detail: "You host it",
  },
  {
    number: "03",
    icon: Plug,
    title: "Your model",
    body: "Connect the Codex or Claude Code subscription you already pay for. The deterministic scan still runs without one.",
    detail: "Optional",
  },
];

const faqs = [
  {
    question: "What is Drover, exactly?",
    answer:
      "Drover is building the founder-controlled Product and go-to-market system: one venture canvas for understanding, manipulating, and executing the whole system, directed through one continuous conversation. The current alpha proves the local runtime and authority substrate while the unified canvas is still being completed.",
  },
  {
    question: "Do I need Claude or Codex to start?",
    answer:
      "Drover's durable venture model and repository truth are local. Connect Codex or Claude Code when you want founder-directed research, design, implementation, comparison, or verification.",
  },
  {
    question: "What does local-first mean here?",
    answer:
      "Drover runs on your machine and keeps canonical venture state there. It binds to your local product repository and uses the model subscription you already have.",
  },
  {
    question: "Can Drover work or act by itself?",
    answer:
      "Founder direction beginning every run is the governing requirement. Direct work is available today; legacy founder-enabled heat can still wake work unattended, and outcome-contract workflows are not yet implemented. Exact sends, publish, deploy, spend, destructive actions, and ambiguous canonical changes remain founder-held.",
  },
  {
    question: "Is this a hosted product?",
    answer:
      "Not yet. Drover is a source-available alpha whose shipped founder product is Electron desktop. The honest next proof is an outside founder completing a real Product and go-to-market loop with it.",
  },
];

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
              <h1 id="hero-title">See and shape the whole venture.</h1>
              <p className="hero-lede">
                Drover is building one living canvas for the full Product and
                go-to-market system. Conversation directs it. Claude and Codex expand
                what one founder can accomplish. Every consequence stays under your hand.
              </p>
              <div className="hero-actions">
                <Button
                  className="primary-cta"
                  size="lg"
                  render={<a href={`${githubUrl}#run-locally`} />}
                >
                  Run Drover locally
                  <ArrowRight data-icon="inline-end" />
                </Button>
                <Button
                  className="secondary-cta"
                  variant="outline"
                  size="lg"
                  render={<a href="#machine" />}
                >
                  See the system
                </Button>
              </div>
              <p className="hero-note">
                Current alpha: local venture state, repository-grounded work, and founder-gated authority.
                The unified Product/GTM canvas is in active development.
              </p>
            </AnimatedGroup>

            <AnimatedGroup className="hero-visual">
              <MachineCanvas />
            </AnimatedGroup>
          </section>

          <section className="proof-band" aria-label="Drover operating principles">
            <div className="proof-intro">
              <span className="proof-mark" aria-hidden="true">
                D
              </span>
              <strong>One founder-controlled system around connected intelligence.</strong>
            </div>
            <div className="proof-item">
              <Code2 />
              <span>Product truth stays cited</span>
            </div>
            <div className="proof-item">
              <CircleStop />
              <span>Outward work stops for you</span>
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
                <h2 id="loop-title">One model. Product and go-to-market together.</h2>
                <p>
                  Drover is being built to keep Product truth, market understanding,
                  work, exact consequences, and returned evidence in one manipulable
                  system—so different lenses remain views of the same venture.
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
                  destroy, or materially rewrite ambiguous venture truth, Drover
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
                <span>Run Drover</span>
                <span>zsh</span>
              </div>
              <pre>
                <code>
                  <span className="terminal-comment"># from the Drover repo</span>
                  {"\n"}
                  <span className="terminal-prompt">$</span> npm install
                  {"\n"}
                  <span className="terminal-prompt">$</span> npm run app
                  {"\n\n"}
                  <span className="terminal-success">✓</span> Drover desktop is opening
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

          <section
            className="loop-section"
            id="pricing"
            aria-labelledby="pricing-title"
          >
            <div className="loop-heading">
              <InView>
                <p className="section-index">Pricing</p>
                <h2 id="pricing-title">You already own what it costs.</h2>
                <p>
                  Drover is a source-available alpha you run yourself. No usage
                  bill, no seat, and no hosted plan yet — you bring the machine
                  and the model subscription you already have.
                </p>
              </InView>
            </div>

            <div className="loop-list">
              {pricingLines.map((line) => {
                const Icon = line.icon;
                return (
                  <InView className="loop-row" key={line.number}>
                    <span className="loop-number">{line.number}</span>
                    <span className="loop-icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <div className="loop-copy">
                      <h3>{line.title}</h3>
                      <p>{line.body}</p>
                    </div>
                    <span className="loop-detail">{line.detail}</span>
                  </InView>
                );
              })}
            </div>
          </section>

          <section className="faq-section" aria-labelledby="faq-title">
            <div className="faq-heading">
              <p>Before you clone it</p>
              <h2 id="faq-title">Straight answers about the alpha.</h2>
            </div>
            <Accordion className="faq-list" defaultValue={defaultFaqValue}>
              {faqs.map((faq, index) => (
                <AccordionItem key={faq.question} value={`item-${index}`}>
                  <AccordionTrigger>{faq.question}</AccordionTrigger>
                  <AccordionContent>
                    <p>{faq.answer}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>

          <section className="final-cta" aria-labelledby="final-title">
            <InView>
              <DroverWordmark />
              <h2 id="final-title">Give the whole venture one place to live.</h2>
              <p>
                See Product and go-to-market together. Direct the right context.
                Keep every consequence yours.
              </p>
              <Button
                className="final-button"
                size="lg"
                render={<a href={`${githubUrl}#run-locally`} />}
              >
                <GitFork data-icon="inline-start" />
                Run from source
                <ArrowRight data-icon="inline-end" />
              </Button>
            </InView>
          </section>
        </main>

        <footer className="site-footer">
          <a href="#top" aria-label="Back to top">
            <DroverWordmark />
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
