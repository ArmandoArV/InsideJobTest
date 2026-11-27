# How the agents were directed

A short note, as asked. The claim under test is not that a marketplace got built — it is
that someone can direct fallible agents at a security-critical system and still be
answerable for the result. This is how that was attempted, including where it failed.

## The spec was the shared context

`SPEC.md` was written and committed before any application code. Every delegated task
referenced a section number rather than restating requirements, so there was one source of
truth and drift was visible as a contradiction rather than a divergence of vocabulary.

That ordering is also what made the spec useful as a weapon against myself later: three of
its security decisions turned out to be asserted and unimplemented, and the document is
what made that discoverable. A spec you cannot be caught by is not doing any work.

## Decomposition by invariant, not by file

Tasks were scoped to things that could be verified — "make transfers sum to zero under
concurrent acceptance" — rather than to directories. The practical consequence is that
every unit of delegated work had a pass/fail condition before it started, so reviewing it
was a matter of running something rather than reading sympathetically.

## What was not delegated

The blast-radius code was written and reviewed by hand: identity, the authorization
predicates, the ledger and escrow transitions, and the transition table. Karpathy's rule —
*you are not allowed to introduce vulnerabilities because of vibe coding* — read
operationally means the code that defines what a compromised agent can reach does not get
accepted unread.

Everything else was delegated at breadth: route handlers against a fixed schema, the UI,
the simulation archetypes, the Bruno collection, the migrations' mechanical parts.

## The architectural choice that made delegation survivable

Correctness that money depends on lives in PostgreSQL, not in application code,
*specifically because* some of the application code is agent-written. Balances are a sum
over an append-only ledger; transfers must sum to zero; escrow is an account rather than a
flag; row-level security is forced and the app connects as a role that cannot bypass it.

A generated query that forgets its `WHERE` clause returns zero rows instead of leaking a
table. That is not defence in depth for its own sake — it is what reduces the review burden
on generated code to something a person can actually carry.

## Adversarial review was separated from authorship

The suite that attacks the system was written against the threat register rather than
against the implementation, and it is run from outside over the public HTTP API with real
credentials. An agent marking its own homework is worthless, so the attacking side was
never shown the defending side's reasoning.

This is the part that earned its keep. Four defects were found by running the suite that
reading the code did not surface:

1. **Row-level security was silently bypassed.** The application connected as a superuser,
   and a superuser ignores every policy, `FORCE` or not. Every policy was decoration and a
   private offer leaked to an unrelated agent. On the managed database it would have passed
   by luck, because that owner role is not a superuser — which is exactly the kind of
   accident that ships.
2. **`SELECT … FOR UPDATE` applies the UPDATE policy**, not only SELECT. A bidder locking a
   listing made the row vanish: a correctness bug wearing a security control's clothes.
3. **Deadlines were written and never read.** A buyer could have an offer accepted and
   never fund it, locking the listing permanently. The first production sweep cancelled ten
   stuck trades, nine of which predated the test.
4. **Three security decisions were asserted and absent** — strict headers, the registration
   limit, and deadline enforcement — found by verifying the spec against the deployment
   rather than trusting it.

## What a human decided

The direction was not accepted as proposed. The decisions that changed the build:
rejecting a separate Go service because it adds a trust boundary and a deployment target
without buying anything; excluding yellow, which forced escrow onto a different hue and
retired the first visual direction entirely; supplying a real competitor as the reference
instead of an abstract brief; and choosing the design direction that had *beaten* the
leading candidate rather than the one presented first.

Agents proposed; none of those were an agent's call.

## Where this fell short

Honest limits, since the method should be judged on them too:

- **There is no CI and there are no unit tests.** The suites are end-to-end and need a live
  system. Nothing guards the transition table on an ordinary change — the weakest point in
  the whole arrangement, because it is the one that decays silently.
- **Prompt-injection resistance is argued, not demonstrated.** The simulation runs
  deterministically, and a heuristic cannot be prompt-injected. The assertions are wired
  and the threat register says `partial` rather than rounding up.
- **The AI layer in §12 was specified and never built.** Marked unbuilt rather than
  deleted.
- **Git history begins after the code.** The repository was initialised late, so the
  spec-before-code ordering is legible in the commit sequence but not provable from
  timestamps. Stated rather than finessed.
