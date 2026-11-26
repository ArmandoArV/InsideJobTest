# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router, Node runtime) · PostgreSQL (Neon) · CSS Modules. Chosen by the user.
Go for a separate backend service was considered and declined: it adds a service-to-service
trust boundary and a second deployment target to a project graded by adversaries on a 48-hour
clock, while the hard concurrency is already delegated to PostgreSQL constraints. Go remains
the chosen language for the standalone red-team/simulation CLI, which talks to the public HTTP
API as any external client would.

## Users

**Primary: autonomous AI agents**, acting on behalf of human owners, trading used electronics
with each other over an HTTP API. An agent's job is to list devices, search, negotiate private
offers, settle through escrow, and rate counterparties. Agents are the only principals that can
act; some of them are hostile.

**Secondary: the human owners and observers**, who get a strictly read-only web view. Their job
is to understand what their agents did and whether the market is behaving — not to trade. A
third audience exists for this project specifically: an evaluator who will point ten adversarial
agents at the deployment and then ask the author to defend the security decisions live.

## Product Purpose

A marketplace where software agents, not people, discover each other, negotiate privately, and
settle real-feeling transactions under escrow. It exists to answer whether an agent-to-agent
economy can be made safe: the product is the containment, not the shopping. Success is that
twenty-plus agents complete genuine negotiated trades, the credit ledger provably conserves
value, and a fleet of hostile agents cannot exceed the authority of its own principal.

## Positioning

Escrow, identity and reputation are enforced by database invariants rather than by agent good
behaviour. A compromised or hijacked agent can make bad trades with its own credits and nothing
else. Competing "AI marketplace" demos put the authority to move money inside the model's
reasoning; here the model emits a typed intent that the server validates, and every balance is
a derived sum over an append-only double-entry ledger.

## Operating Context

- Agents authenticate with API keys and act exclusively over the public HTTP API; the simulation
  and the red-team fleet use that same surface, so nothing passes through a privileged back door.
- Humans arrive at a public URL with no credential and no session capable of writing.
- The evaluation is adversarial and time-boxed: a 48-hour build, then ten attacking agents,
  then a 20-minute walkthrough of security decisions.
- Device condition, trade state and credit amounts are the vocabulary the interface must make
  instantly legible: open, escrowed, shipped, delivered, settled, disputed.

## Capabilities and Constraints

- Listings carry a declared condition (constrained enum, never model-authored prose) and an
  asking price in integer credits.
- Offers are private to the buyer and the listing's seller, enforced in the application layer
  and again by PostgreSQL row-level security.
- Credits are fake by assignment. No payment processor, no card data, no real personal data
  anywhere in the system.
- Escrow is a distinct ledger account, never a boolean flag; releasing it is a system
  consequence of buyer-confirmed delivery, never a seller-fired request.
- Ratings require a settled trade, one per side, immutable; self-dealing and circular wash
  trades are detected via the immutable owner graph and excluded from aggregates.
- Agent identity is an opaque, immutable server-generated ID. Handles are deliberately mutable
  and non-unique so that no code is tempted to authorize by name.
- Humans cannot trade, dispute, or arbitrate. Disputes resolve by deadline rule.
- Full specification: `docs/SPEC.md`, written and committed before implementation.

## Brand Commitments

- Name: **AgentBazaar** (confirmed).
- Visual constraint volunteered by the user and binding: the dense, information-rich card-grid
  language of MercadoLibre, with a palette of the author's choosing rather than MercadoLibre's
  own brand yellow.
- Spanish is the author's working language; the deliverable and interface are in English because
  the evaluator's brief is in English.

## Evidence on Hand

- `docs/SPEC.md` — the full pre-build specification, including threat model and security decisions.
- Device photography: the content-based image retrieval datasets from the author's
  Recuperación de Información coursework (`/Users/armandoav/Maestria-IA/RecuperacionDeInformacion/Tarea1/datasets`),
  roughly 10,800 images with query/reference splits and ground truth.
- Governance sources behind the privacy and audit design: AEPD *Guía de Protección de Datos por
  Defecto*, ENISA *Ingeniería de la Protección de Datos* (2022), NIST AI 600-1 Generative AI
  Profile, and the author's Ética coursework.
- A real CBIR implementation (colour histograms, zone descriptors, blocked distance search)
  whose architecture the listing-search design reuses.
- No customers, no testimonials, no benchmarks, no pricing. None may be fabricated.

## Product Principles

1. **Authority lives in the server, never in the model.** Anything consequential is decided
   against an authenticated agent ID and a transition table.
2. **A compromised agent must not exceed the authority of its own principal.** Containment over
   trust; agents are assumed fallible and some are hostile.
3. **Correctness belongs in the database.** Invariants that money depends on are constraints, not
   application code, because some of the application code is agent-written.
4. **Private by default, published by exception.** Visibility is a stored property enforced at two
   independent layers.
5. **Show the machinery.** Ledger integrity, flagged wash trades, model-driven decisions and
   uncertainty are surfaced to humans rather than hidden, because the read-only view's whole job
   is making an automated market legible.

## Accessibility & Inclusion

WCAG 2.2 AA is a confirmed requirement. It binds the palette: state colours must clear 4.5:1
against their own tinted backgrounds in both light and dark themes, focus states must be
visible, and trade state must never be communicated by colour alone — every state badge pairs
its colour with a text label.
