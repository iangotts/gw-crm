# GW-CRM Build Plan

Nov 10, 2026 · @Ian

Phases 1 to 9 are done, including the import of fans and gigs from GW-GIG, and phase 10, the cutover, has started. The work is on the `phase-1-schema` branch, which is the repo's default branch; `main` points at the same commit.

## Phases and status

| # | Phase | Status |
| --- | --- | --- |
| 1 | Schema and tenancy | Done |
| 2 | Backend and login | Done |
| 3 | Core screens | Done except venues, which are on hold |
| 4 | UTM links | Done |
| 5 | Subscribe, unsubscribe, marketing export | Done |
| 6 | Individual email | Done, on SendGrid |
| 7 | Google Calendar link | Done: free/busy sharing per person, and events for confirmed gigs |
| 8 | Gig to money | Done: fee, deposit and balance plan, payments marked paid by hand. No invoices or ledger |
| 9 | Import and rehearsal | Done: fans and gigs imported from GW-GIG |
| 10 | Cutover | Started: Dockerfile, Railway config and a migrator that needs no psql. Not yet deployed |

## Phase 3 screens

| Screen | Status |
| --- | --- |
| Gig pipeline (board, new gig, drawer, archive, phone) | Done |
| Contact list and detail | Done |
| Activity log: call, voicemail, text, email, note, to-do | Done |
| Follow-up list and reply-owed list | Done |
| Templates | Done |
| Venues | On hold: not sure venues will be used. They can still be picked and added from a gig |

## Open items

- Credit price (Ian suggested $180).
- Analytics tool for UTM visits. Until then, clicks are recorded by hand.
- Cutover date.
- Ian's GW-GIG checks: privacy test, key rotation, subscribe page behaviour, and anything else that creates fans or gigs.
- To build: password reset and user invite screens (use `npm run create-user` for now), a per-account login lockout, and a combined admin activity view.
- To build for the Band Ops agents: a token or service-account login, so the lead-triage agent can create contacts and gigs. Today every caller is a person with a session cookie.
- Browser tests: the earlier plan named Playwright, but none are in the repo yet.

Decided since the last version: the email provider is SendGrid, and the Google Calendar link shares busy times only and adds confirmed gigs.

## Import rules (phase 9)

- Only the two Bubble bands are imported. Every other band ID is dropped.
- Deleted and unsubscribed fans are not copied: 1,274 of 1,340 Jane Blonde fans remain. Duplicate emails are merged (27 groups).
- The 37 RockSolid-flagged fans stay in Jane Blonde with a RockSolid tag and are also copied into ROCKSOLID as contacts only.
- Gigs: Jane Blonde gigs dated on or after 5 Nov 2024 (82). Undated gigs (15) are ignored. `--gigs-from` changes the cut-off.
- Venues are a reference list. Only the 129 venues used by an imported gig or kept contact come over, with 116 fan-venue links.
- Logins: 22 band memberships make 15 users, 6 of them in both bands. Only ACTIVE band members become logins, and they have no password until one is set with `create-user`. ADMIN becomes admin, MEMBER becomes member, VIEWER becomes a read-only member (5 in Jane Blonde).
- Fees: a plain number goes to the quoted fee, anything else to the fee note. A numeric Fee-Paid becomes one payment dated on the gig, or today for a future gig, and is flagged for a hand check. Payments are never dated in the future.
- Rows with a blank band take the band from their gig. Orphans are dropped.
- The exports don't say their time zone, so America/Los_Angeles is assumed.
- Running the import:
  - `--dry-run` writes the reports only.
  - Loading needs `--yes` and names the database it will write to.
  - A second run adds nothing.
  - The import compares its counts with the figures above and prints DIFF for any that differ. It doesn't check the 82 gigs or the 22 memberships yet.

| GW-GIG status | GW-CRM stage |
| --- | --- |
| PITCH | New |
| ON THE LIST | Evaluating |
| IN-PROCESS | In conversation |
| CONTRACTED | Confirmed |
| PERFORMED | Played |
| POSTPONED | Confirmed, flagged postponed |
| CANCELED | Lost (reason: canceled) |
| LOST | Lost |
| Blank | New, flagged for review |
