# GW-CRM UI Spec

Nov 10, 2026 · @Ian

Light pages, a deep indigo header, deep indigo buttons, gold as the main accent and purple for secondary controls. The look follows the ZenAlpha Regal Logic style guide, adjusted for dark buttons.

## Design principles

- **One job per screen.** The pipeline answers: what needs my attention next?
- **Phone first for actions.** Leads arrive on a phone, so the main actions work with a thumb.
- **Plain words.** Buttons say what they do (Add gig, Save changes). Errors say what went wrong and what to do.
- **Read-only is visible.** People who can't edit see no edit controls and a short notice.

## Visual language

The tokens live in `web/src/styles.css`.

| Token | Value | Use |
| --- | --- | --- |
| Page (`--cream`) | #FDFBF7 | Background |
| Surface | #FFFFFF with a gold border | Cards, sheets |
| Dim | #F7F3E9 | Side areas, tags |
| Ink | #1A1030 | Text: a near-black indigo |
| Ink 2 | #5B5470 | Secondary text: a muted purple-grey |
| Dark (`--charcoal`) | #180830 | Header, primary buttons, date stubs: the brand deep indigo |
| Gold | #E2C36A | Header rule, borders, active tab |
| Gold deep | #C9A13C | Brand gold, used sparingly |
| Gold pale, gold soft | #F5E9C5, #EFE6CB | Quiet fills and dividers |
| Purple | #7B2FE0 (deep #5019B0) | Outlined secondary buttons, links, focus |
| Alert | #8F2A2A on #FBEAEA | Errors, Do not email, overdue |

Stage colours: New #5F7A99, Evaluating #7A5BA6, In conversation #C9A227, Confirmed #4E8B63, Played #8A8C86, Lost #B05A5A.

Type: Newsreader semi-bold for headlines, Inter medium for interface text. Both are self-hosted (`@fontsource-variable`).

The style guide's colour table was empty. The palette was later moved to the brand indigo and purple, and the stage colours are kept as first chosen. The guide makes primary buttons gold with dark text. Ian asked for dark, so primary buttons are deep indigo.

## Pipeline screen

- Dark header with the GW-CRM name, a band switcher and Sign out, over a 3px gold rule.
- Six columns by stage, each with a count. A gig card is a ticket: dark date stub on the left, title, contact, budget and source tags. Confirmed and Played cards show a payment chip.
- Drag a card to another column, or use the select on the card. The move shows at once and reverts with a message if the server refuses.
- Played and Lost show the latest 8 with a Show all button.
- Search covers gig, venue and contact names.
- Flags on cards: postponed, reply owed, past date, missing details.

## Gig drawer and New gig

- The drawer holds stage, date, times, people and place, money, calendar, follow-up, lead details, notes and history.
- Save sends only the fields that changed.
- Archive needs a second click to confirm.
- New gig asks for a name first. Contact and venue are search boxes that can add a new record inline.
- Escape closes the top sheet first: a dialog, then the drawer under it. It also closes the contact drawer, search boxes, the link builder and the template editor.

## Money (in the gig drawer)

- Shows the fee, what was received, what is still to come, and a status: Unpaid, Part paid, Paid or Overpaid.
- Plan deposit and balance takes a deposit percent. It rounds the deposit once and makes the balance the remainder, so the two always add up to the fee.
- Other payment adds a single payment with a type, an amount and a due date.
- A person marks each payment paid with the date received. Nothing is guessed from a bank.
- A note shows when planned payments don't match the fee. A received payment can't be removed until it is marked not paid.

## Calendar

- The Calendar button in the header opens a dialog. Each person connects their Google Calendar and chooses which calendar each band may check for conflicts, or Not shared.
- An admin also chooses where confirmed gigs are added and the time zone for gig times.
- In the gig drawer, the Calendar panel shows who is busy on the gig's date. It shows only busy times, never event names. With no date it says to add one.
- A sync problem shows on the gig with a Try again button. If Google isn't set up on the server, the dialog says the calendar link is not turned on.

## Email

- Contacts and gigs have a Send email button. The composer has a subject and message, and can start from a template. The signature is added when it is sent.
- Send is blocked while a placeholder is unfilled, when the contact has no email address, or when the address bounced or is blocked. An unsubscribed contact needs an explicit confirm.
- Email settings (from Templates) set the from name, from address, reply-to inbox and signature. Only an admin can change them; others see them read-only.

## Subscribers and consent

- Contacts has an Email list button. It shows counts by consent (Subscribed, Unsubscribed, Bounced or blocked, No consent recorded) and the band's sign-up page address.
- Export for bulk email filters by tag and by where people live (Anywhere, Local only, Not local) and downloads a CSV. Only people with a Subscribed record are included. Only members who can edit can export.
- The contact drawer has a consent panel: Subscribed, Unsubscribed, Bounced, or Suppressed, never email.

## Public pages (no login)

- `/subscribe/<band slug>`: email, optional first name and a consent tickbox. A hidden trap field and a minimum fill time stop bots. It ends with "Thanks, you are on the list".
- `/unsubscribe/<token>`: confirms the unsubscribe and offers to undo it.
- A bad link or an unknown band shows a plain message.

## Login

- Email and password. A person in more than one band picks one after signing in. The band switcher in the header changes it later.

## Phone layout

- Applies below 761px wide. No sideways scrolling at 390px wide.
- Header is one row: name, band switcher, Sign out.
- Stage tabs replace the columns, with a count on each.
- Floating New gig button at bottom right.

## Accessibility

- Visible keyboard focus, labelled fields, drawer and dialog roles, and a status message for every save or move.
- Colour is never the only signal: stages also have names and counts.

## Contacts, follow-ups, templates and links

The header has five pages: Pipeline, Contacts, Follow-ups, Templates, Links. On a phone they become a tab bar at the bottom, and the New buttons float above it.

- **Contacts:** one row per person with email, phone, tags, open gigs and when they were last contacted. Tag chips filter the list. A person whose email is unsubscribed, bounced or suppressed shows a red Do not email chip.
- **Contact drawer:** quick call and email links, their gigs, then Activity, Links and Details, in that order, because the log is what people come back to.
- **Activity log:** choose Call, Voicemail, Text, Email, Note or To do, write what happened, and log it. Email and text can start from a template. A to-do has a due date and a checkbox.
- **Follow-ups:** three lists. Replies owed. To follow up (to-dos and gigs to chase). Payments (unpaid payments with a due date, and played gigs that still owe money). Overdue rows have a red edge. Each row has one button: Replied, Done or Marked paid.
- **Templates:** cards with Copy and Edit. Placeholders {first\_name}, {name}, {band} and {gig} fill in when used.
- **Links:** the band's shareable pages, each with how often it was sent and clicked. In a contact or gig, the link builder shows the tagged address as you type, then creates and copies it.
- **Plain-language rule for links:** the screen says the address names the band, how it was sent and the campaign, not the person.
