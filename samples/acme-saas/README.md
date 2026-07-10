# Acme

A small team task tracker. Create a workspace, invite a couple of teammates, share
a read-only project brief, and track who's doing what. This is a bundled **sample product** that ships with Drover
so a founder without an instrumented codebase of their own can still watch the
read-only scan work on real code.

It is a deliberately ordinary early-stage SaaS: Next.js app router, a Segment
analytics wrapper, a marketing landing page, and a signup flow. Nothing here is
contrived for the scanner — it reads like code a two-person startup would actually
ship, including the one honest mistake most of them make.

## The honest mistake

The marketing landing page reads `utm_source` off the URL and stashes it in a
cookie (`src/app/page.tsx`, `src/lib/attribution.ts`). But the signup flow fires
its win event — `signup_completed` — without ever reading that cookie back
(`src/app/signup/actions.ts`). So every new account lands with no idea which
campaign, post, or referral produced it. The data is captured at the front door
and thrown away at the finish line.

That is the attribution gap Drover proves from the code itself.

## The product-shaped opening

Acme already turns a live project into a signed, read-only brief that a teammate
can share outside the workspace (`src/app/w/share/actions.ts`). The code records
both the share and the recipient's first view. That supports a concrete product
hypothesis: make the brief useful enough to carry Acme into the next collaborator's
workspace. It is an opening to investigate, not evidence that recipients convert.
