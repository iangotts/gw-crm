# GW-CRM design sitemap

The current design documents for GW-CRM. Each one is the source of truth for its area; when the code and a document disagree, run `/egm:egm-drift-report docs/designs/` and decide which side to change.

| Document | Covers | Code it describes |
| --- | --- | --- |
| [tech-spec.md](./tech-spec.md) | Architecture, tenancy and security, data model, API routes, UTM links | [db/](../../db/README.md), [src/](../../src/README.md), [src/routes/](../../src/routes/README.md) |
| [ui-spec.md](./ui-spec.md) | Visual language, pipeline, gig drawer, phone layout, accessibility, contacts, follow-ups, templates, links | [web/](../../web/README.md), [web/src/](../../web/src/README.md) |
| [build-plan.md](./build-plan.md) | Phases and status, phase 3 screens, open items, import rules | [src/import/](../../src/import/README.md), [src/cli/](../../src/cli/README.md), [db/seeds/](../../db/seeds/README.md) |

Copied on 10 Nov 2026 from the "GW-CRM docs" folder next to this repo. The originals there are no longer the ones to edit.

## Not design documents for this repo

These stay in the "GW-CRM docs" folder:

- **GW-CRM - build plan.md** (Track A and B): superseded. It plans a GigWorks integration, a ledger and an availability table that were later dropped.
- **Band Ops Agents - Phased Build Plan.md**: the separate Paperclip agent system. It depends on this CRM offering an API that agents can call.
- **GW-CRM - lead process.md**: requirements notes on how leads are handled, the input to the specs above.
