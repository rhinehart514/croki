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
    title: "Read the real product",
    body: "A deterministic scan builds cited product terrain before a model is connected. Claims remain tied to the files that prove them.",
    detail: "Evidence first",
  },
  {
    number: "02",
    icon: Sparkles,
    title: "Find an opening worth testing",
    body: "Claude or Codex adds hypotheses, tensions, and unknowns. Drover keeps those reads visibly separate from product fact.",
    detail: "Judgment stays labeled",
  },
  {
    number: "03",
    icon: MousePointer2,
    title: "Build the bet on the canvas",
    body: "Research, artifacts, product changes, and repeatable paths stay editable in place instead of disappearing into a transcript.",
    detail: "Work stays visible",
  },
  {
    number: "04",
    icon: LockKeyhole,
    title: "Stop at the founder wall",
    body: "A pipeline can prepare the work. Sending, publishing, deploying, spending, or applying a change still requires your explicit call.",
    detail: "Authority stays yours",
  },
  {
    number: "05",
    icon: CheckCircle2,
    title: "Return the outcome",
    body: "A reply, miss, win, or no-signal result lands back on the experiment that caused it and changes what the machine tries next.",
    detail: "The loop learns",
  },
];

const principles = [
  {
    number: "I",
    icon: FileCheck2,
    title: "Truth does not need a model.",
    body: "The first product picture comes from a read-only repository scan. Inference is useful, but it never gets dressed up as fact.",
  },
  {
    number: "II",
    icon: ShieldCheck,
    title: "The crew cannot approve itself.",
    body: "Outward effects stop at a visible wall with the exact artifact, destination, and consequence ready for your review.",
  },
  {
    number: "III",
    icon: Sparkles,
    title: "Your corrections become taste.",
    body: "Approvals, edits, rejections, and real outcomes form durable context that survives a change of model or runtime.",
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
      "Drover is a local-first experiment machine for product and go-to-market work. It gives founders one living canvas for product truth, parallel bets, agent work, approvals, and real outcomes.",
  },
  {
    question: "Do I need Claude or Codex to start?",
    answer:
      "No. The deterministic product scan and existing terrain work without an AI runtime. Connect Codex or Claude Code when you want model-generated reads, composition, or crew work.",
  },
  {
    question: "What does local-first mean here?",
    answer:
      "Drover runs on your machine and keeps its working state there. It uses your local product repository and can work through the model subscription you already have.",
  },
  {
    question: "Can Drover send, publish, or deploy by itself?",
    answer:
      "No. A pipeline may prepare an outward effect, but it stops at the founder wall. Agents cannot approve their own work through the browser, API, or MCP surface.",
  },
  {
    question: "Is this a hosted product?",
    answer:
      "Not yet. Drover is a source-available alpha that currently runs on macOS or Linux with Node.js and Git. The honest next proof is an outside founder producing a real-world result with it.",
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
              <h1 id="hero-title">Vibe code your go-to-market.</h1>
              <p className="hero-lede">
                Turn the product you already built into a living field of product
                and go-to-market experiments. Claude and Codex do the legwork. You
                stay on the canvas, at the wheel, and at the wall.
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
                  See the machine
                </Button>
              </div>
              <p className="hero-note">
                Source available. macOS or Linux. Node.js and Git.
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
              <strong>A small harness around rented intelligence.</strong>
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
                <p className="section-index">The experiment machine</p>
                <h2 id="loop-title">Build more ventures. Keep one honest picture.</h2>
                <p>
                  Drover keeps the product, the work, the decisions, and what came
                  back in the same field. A pipeline appears only when execution
                  actually needs one.
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
                <span className="wall-number">04 / NEEDS YOU</span>
                <h2 id="wall-title">
                  The fast lane ends where your authority begins.
                </h2>
                <p>
                  Let the crew move quickly inside the workspace. The moment work
                  wants to leave it, Drover turns the exact effect into a decision
                  you can inspect.
                </p>
                <p className="wall-maxim">Agents prepare. Founders release.</p>
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
                    <small>Founder decision 03</small>
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
                    <dd>Pilot lead</dd>
                  </div>
                  <div>
                    <dt>Changes</dt>
                    <dd>1 public page, 0 paid actions</dd>
                  </div>
                </dl>
                <div className="approval-receipt">
                  <Check />
                  <p>
                    Claims checked against 43 cited files. Preview and rollback
                    path are ready.
                  </p>
                </div>
                <div className="approval-actions" aria-hidden="true">
                  <span>Keep staged</span>
                  <span className="approve-button">Approve release</span>
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
                Run the current alpha on your own machine. The deterministic scan
                works without a model. Connect Codex or Claude Code when you want
                the crew to work.
              </p>
              <ul className="local-checks">
                <li>
                  <Check /> Local product and working state
                </li>
                <li>
                  <Check /> Existing model subscription
                </li>
                <li>
                  <Check /> Founder-only approval code
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
                  <span className="terminal-prompt">$</span> npm start
                  {"\n\n"}
                  <span className="terminal-success">✓</span> Drover is ready at
                  {"\n"}  http://127.0.0.1:4317
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
              <h2 id="final-title">Give the next venture somewhere to live.</h2>
              <p>
                Start with the product. Keep the work visible. Make every outward
                move yours.
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
          <p>Local-first experiment machinery for founders.</p>
          <div>
            <a href={`${githubUrl}#run-locally`}>Setup</a>
            <a href={githubUrl}>Source</a>
          </div>
        </footer>
      </div>
    </>
  );
}
