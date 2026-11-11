import { describe, expect, it } from 'vitest';
import { dateParts, feeText, flagsFor, groupByStage, isBefore, money, orderColumn, shortDate, todayIso } from './stages';
import type { Gig } from './types';

const gig = (over: Partial<Gig> = {}): Gig => ({
  id: '1', title: 'G', stage: 'new', postponed: false, event_date: null, start_time: null, event_type: null,
  platform: null, budget: null, fee_quoted: null, fee_note: null, next_action_at: null, reply_owed_by: null,
  decision: null, contact_id: null, venue_id: null, contact_name: null, venue_name: null, updated_at: '', ...over,
});

describe('groupByStage', () => {
  it('puts each gig in its stage and keeps order', () => {
    const g = groupByStage([gig({ id: 'a', stage: 'lost' }), gig({ id: 'b' }), gig({ id: 'c', stage: 'lost' })]);
    expect(g.new.map((x) => x.id)).toEqual(['b']);
    expect(g.lost.map((x) => x.id)).toEqual(['a', 'c']);
    expect(g.confirmed).toEqual([]);
  });
});

describe('dateParts', () => {
  it('splits a date without shifting the day', () => {
    expect(dateParts('2027-07-04')).toEqual({ day: '4', month: 'Jul', year: '2027', weekday: 'Sun' });
    expect(dateParts('2026-12-31')?.day).toBe('31');
    expect(dateParts('2026-01-01')?.month).toBe('Jan');
  });
  it('returns null for a missing or malformed date', () => {
    expect(dateParts(null)).toBeNull();
    expect(dateParts('July 4')).toBeNull();
  });
});

describe('dates and money', () => {
  it('formats today as YYYY-MM-DD in local time', () => {
    expect(todayIso(new Date(2026, 10, 5, 23, 59))).toBe('2026-11-05');
  });
  it('compares dates as text', () => {
    expect(isBefore('2026-11-04', '2026-11-05')).toBe(true);
    expect(isBefore('2026-11-05', '2026-11-05')).toBe(false);
    expect(isBefore(null, '2026-11-05')).toBe(false);
  });
  it('shows whole dollars without cents', () => {
    expect(money('2500.00')).toBe('$2,500');
    expect(money('99.5')).toBe('$99.50');
    expect(money(null)).toBeNull();
    expect(money('abc')).toBeNull();
  });
  it('shortens a date', () => expect(shortDate('2027-07-04')).toBe('Jul 4'));
});

describe('feeText', () => {
  it('shows the quote alone and leaves its note for the drawer', () => {
    expect(feeText(gig({ fee_quoted: '1800.00', fee_note: '+ travel' }))).toBe('$1,800');
  });
  it('shows a short note on its own, such as door deals', () => {
    expect(feeText(gig({ fee_note: '50% of door' }))).toBe('50% of door');
  });
  it('cuts a long note to fit the card', () => {
    expect(feeText(gig({ fee_note: '2500 + GS fee of $250 and parking' }))).toBe('2500 + GS fee of $250 a…');
  });
  it('falls back to the budget, then to nothing', () => {
    expect(feeText(gig({ budget: '2500.00' }))).toBe('Budget $2,500');
    expect(feeText(gig())).toBeNull();
  });
});

describe('flagsFor', () => {
  const today = '2026-11-05';
  it('flags an overdue reply and a due follow-up', () => {
    const f = flagsFor(gig({ reply_owed_by: '2026-11-01', next_action_at: '2026-11-05T17:00:00.000Z' }), today);
    expect(f.map((x) => x.text)).toEqual(['Reply overdue', 'Follow up due']);
  });
  it('shows a future reply date as information', () => {
    expect(flagsFor(gig({ reply_owed_by: '2026-11-09' }), today)).toEqual([{ text: 'Reply by Nov 9', tone: 'info' }]);
  });
  it('ignores reminders on gigs that are finished', () => {
    expect(flagsFor(gig({ stage: 'played', reply_owed_by: '2026-01-01' }), today)).toEqual([]);
    expect(flagsFor(gig({ stage: 'lost', next_action_at: '2026-01-01T00:00:00Z' }), today)).toEqual([]);
  });
  it('shows postponed', () => {
    expect(flagsFor(gig({ stage: 'confirmed', postponed: true }), today)[0]?.text).toBe('Postponed');
  });
});

describe('date flags', () => {
  const today = '2026-11-10';
  const booked = { stage: 'confirmed' as const, start_time: '16:00:00', contact_id: 'c', fee_quoted: '2000.00' };
  it('asks whether a booked gig in the past was played', () => {
    expect(flagsFor(gig({ ...booked, event_date: '2026-04-23' }), today).map((f) => f.text)).toEqual(['Played?']);
  });
  it('does not ask about a postponed gig', () => {
    expect(flagsFor(gig({ ...booked, event_date: '2026-04-23', postponed: true }), today).map((f) => f.text)).toEqual(['Postponed']);
  });
  it('flags an open lead whose date has passed', () => {
    expect(flagsFor(gig({ event_date: '2025-06-07' }), today).map((f) => f.text)).toEqual(['Past date']);
    expect(flagsFor(gig({ event_date: '2026-12-01' }), today)).toEqual([]);
  });
  it('flags an upcoming booked gig that is missing a start time, contact or fee', () => {
    expect(flagsFor(gig({ ...booked, event_date: '2026-12-12' }), today)).toEqual([]);
    expect(flagsFor(gig({ ...booked, event_date: '2026-12-12', start_time: null }), today).map((f) => f.text)).toEqual(['Missing details']);
    expect(flagsFor(gig({ ...booked, event_date: null }), today).map((f) => f.text)).toEqual(['Missing details']);
  });
});

describe('orderColumn', () => {
  const today = '2026-11-10';
  const ids = (l: Gig[]): string[] => l.map((g) => g.id);
  const gigs = [
    gig({ id: 'old', event_date: '2025-06-07' }),
    gig({ id: 'later', event_date: '2027-01-15' }),
    gig({ id: 'none' }),
    gig({ id: 'soon', event_date: '2026-11-20' }),
    gig({ id: 'older', event_date: '2024-11-09' }),
  ];
  it('puts upcoming leads first, soonest at the top, and keeps past ones apart, newest first', () => {
    const o = orderColumn('new', gigs, today);
    expect(ids(o.shown)).toEqual(['soon', 'later', 'none']);
    expect(ids(o.past)).toEqual(['old', 'older']);
  });
  it('puts past booked gigs first so they get marked played', () => {
    const o = orderColumn('confirmed', gigs.map((g) => ({ ...g, stage: 'confirmed' as const })), today);
    expect(ids(o.shown)).toEqual(['older', 'old', 'soon', 'later', 'none']);
    expect(o.past).toEqual([]);
  });
  it('shows played gigs newest first', () => {
    expect(ids(orderColumn('played', gigs, today).shown)).toEqual(['later', 'soon', 'old', 'older', 'none']);
  });
});
