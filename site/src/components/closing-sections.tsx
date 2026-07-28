import { ArrowRight, GitFork } from "lucide-react";
import { defaultFaqValue, faqs, githubUrl, pricingLines } from "@/content/home";
import { CrokiWordmark } from "@/components/croki-wordmark";
import { InView } from "@/components/motion-primitives/in-view";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

export function ClosingSections() {
  return <>
    <section className="loop-section" id="pricing" aria-labelledby="pricing-title">
      <div className="loop-heading">
        <InView>
          <p className="section-index">Pricing</p>
          <h2 id="pricing-title">You already own what it costs.</h2>
          <p>
            Croki is a source-available alpha you run yourself. No usage bill,
            no seat, and no hosted plan yet — you bring the machine and the model
            subscription you already have.
          </p>
        </InView>
      </div>
      <div className="loop-list">
        {pricingLines.map((line) => {
          const Icon = line.icon;
          return (
            <InView className="loop-row" key={line.number}>
              <span className="loop-number">{line.number}</span>
              <span className="loop-icon" aria-hidden="true"><Icon /></span>
              <div className="loop-copy"><h3>{line.title}</h3><p>{line.body}</p></div>
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
            <AccordionContent><p>{faq.answer}</p></AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
    <section className="final-cta" aria-labelledby="final-title">
      <InView>
        <CrokiWordmark />
        <h2 id="final-title">Keep building without losing the product.</h2>
        <p>Direct Claude or Codex in the real repository, review the exact work, and let useful product context compound across every Thread.</p>
        <Button className="final-button" size="lg" render={<a href={`${githubUrl}#run-locally`} />}>
          <GitFork data-icon="inline-start" /> Run from source <ArrowRight data-icon="inline-end" />
        </Button>
      </InView>
    </section>
  </>;
}
