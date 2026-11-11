import type { Gig, StageKey } from './types';

export interface Stage {
  key: StageKey;
  label: string;
  /** What this stage means, shown as a tooltip. */
  hint: string;
}

export const STAGES: Stage[] = [
  { key: 'new', label: 'New', hint: 'A lead that has come in and not been looked at yet' },
  { key: 'evaluating', label: 'Evaluating', hint: 'Deciding whether to pursue it' },
  { key: 'in_conversation', label: 'In conversation', hint: 'Talking with them, possibly quoted' },
  { key: 'confirmed', label: 'Confirmed', hint: 'Booked' },
  { key: 'played', label: 'Played', hint: 'The gig has happened' },
  { key: 'lost', label: 'Lost', hint: 'Declined, cancelled or went elsewhere' },
];

export const stageLabel = (key: StageKey): string => STAGES.find((s) => s.key === key)?.label ?? key;

export function groupByStage(gigs: Gig[]): Record<StageKey, Gig[]> {
  const out: Record<StageKey, Gig[]> = { new: [], evaluating: [], in_conversation: [], confirmed: [], played: [], lost: [] };
  for (const g of gigs) out[g.stage].push(g);
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface DateParts {
  day: string;
  month: string;
  year: string;
  weekday: string;
}

/** Split a YYYY-MM-DD date for the stub. Built from the parts so no time zone can shift the day. */
export function dateParts(iso: string | null): DateParts | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const weekday = DAYS[new Date(y, mo - 1, d).getDay()] ?? '';
  return { day: String(d), month: MONTHS[mo - 1] ?? '', year: String(y), weekday };
}

export function todayIso(now: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** YYYY-MM-DD strings compare correctly as text. */
export const isBefore = (a: string | null, b: string): boolean => a !== null && a < b;

export function money(value: string | number | null): string | null {
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 === 0 ? 0 : 2 });
}

const NOTE_ON_CARD = 24;

/**
 * The fee chip on a card. A quote shows as the amount alone; its note (such as "+ travel") stays in the
 * drawer. With no quote, a short note such as "50% of door" shows, cut to fit. Falls back to the budget.
 */
export function feeText(g: Pick<Gig, 'fee_quoted' | 'fee_note' | 'budget'>): string | null {
  const quote = money(g.fee_quoted);
  if (quote) return quote;
  const note = g.fee_note?.trim();
  if (note) return note.length > NOTE_ON_CARD ? `${note.slice(0, NOTE_ON_CARD - 1).trimEnd()}…` : note;
  const budget = money(g.budget);
  return budget ? `Budget ${budget}` : null;
}

const OPEN: StageKey[] = ['new', 'evaluating', 'in_conversation'];

/**
 * A column in the order that answers "what needs me next". Open leads: upcoming dates first, soonest at
 * the top, then undated; leads whose date has passed are kept apart so they can be folded away.
 * Confirmed: past gigs first (they need marking played), then upcoming soonest first, then undated.
 * Played and Lost: newest first.
 */
export function orderColumn(stage: StageKey, gigs: Gig[], today: string): { shown: Gig[]; past: Gig[] } {
  const byDate = (a: Gig, b: Gig): number => (a.event_date ?? '9999').localeCompare(b.event_date ?? '9999');
  if (stage === 'played' || stage === 'lost') {
    return { shown: [...gigs].sort((a, b) => (b.event_date ?? '').localeCompare(a.event_date ?? '')), past: [] };
  }
  const past = gigs.filter((g) => isBefore(g.event_date, today)).sort(byDate);
  const rest = gigs.filter((g) => !isBefore(g.event_date, today)).sort(byDate);
  if (stage === 'confirmed') return { shown: [...past, ...rest], past: [] };
  return OPEN.includes(stage) ? { shown: rest, past: past.reverse() } : { shown: [...rest, ...past], past: [] };
}

export interface Flag {
  text: string;
  tone: 'alert' | 'info';
}

/**
 * Small labels on a card: postponed, a past date (Played? on a booked gig), missing details on an
 * upcoming booked gig (date, start time, contact or fee), replies owed and follow-ups that are due.
 */
export function flagsFor(g: Gig, today: string): Flag[] {
  const out: Flag[] = [];
  if (g.postponed) out.push({ text: 'Postponed', tone: 'info' });
  const past = isBefore(g.event_date, today);
  if (past && g.stage === 'confirmed' && !g.postponed) out.push({ text: 'Played?', tone: 'alert' });
  if (past && OPEN.includes(g.stage)) out.push({ text: 'Past date', tone: 'alert' });
  if (g.stage === 'confirmed' && !past && (!g.event_date || !g.start_time || !g.contact_id || (!g.fee_quoted && !g.fee_note))) {
    out.push({ text: 'Missing details', tone: 'info' });
  }
  if (g.stage !== 'played' && g.stage !== 'lost') {
    if (g.reply_owed_by) {
      out.push(
        isBefore(g.reply_owed_by, today)
          ? { text: 'Reply overdue', tone: 'alert' }
          : { text: `Reply by ${shortDate(g.reply_owed_by)}`, tone: 'info' },
      );
    }
    if (g.next_action_at && g.next_action_at.slice(0, 10) <= today) out.push({ text: 'Follow up due', tone: 'alert' });
  }
  return out;
}

export function shortDate(iso: string): string {
  const p = dateParts(iso);
  return p ? `${p.month} ${p.day}` : iso;
}
