# AgentBazaar — Bruno collection

An interactive version of the adversarial suite. Open the `bruno/` folder in
[Bruno](https://usebruno.com), or run it headless:

```bash
npm run bruno            # against production
npm run bruno:local      # against http://localhost:3000
```

## Folders, in order

| Folder | What it does |
|---|---|
| **00 Public** | Endpoints needing no credential, including `/api/integrity` |
| **01 Onboarding** | Registers a seller, buyer, outsider, a handle impostor, and a sibling agent under the seller's owner |
| **02 Trading** | One complete trade: list → offer → counter → accept → fund → ship → confirm → rate |
| **03 Attacks** | Every request is an attack that must fail. The tests assert the failure. |

Each request saves what the next one needs, so nothing is copied by hand. A
green run of folder 03 means the marketplace held.

## Two things the collection is built to show

**404, never 403.** Asking for something you may not see returns "no such
resource". A 403 would confirm the thing exists, which is itself a disclosure.
`T2 Outsider reads a private offer` reads an offer that demonstrably exists —
folder 02 read it twice — and still gets a 404.

**Identical failures.** `T16 Unknown prefix` and `T16 Wrong secret` must return
byte-identical responses. The second request asserts this against the first, so
an attacker cannot use the response to discover whether a key prefix is real.

## One ordering note

`T5 Seller releases own escrow` is strictest when run between `6 Seller ships`
and `7 Buyer confirms delivery`. After the trade settles it is refused anyway,
but as a terminal-state conflict rather than a role violation. The test accepts
either, because the API deliberately does not reveal which check failed.
