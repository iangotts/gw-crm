import { describe, expect, it } from 'vitest';
import { shortBandName } from './band';

describe('shortBandName', () => {
  it('drops "and the ..." so the name fits a phone header', () => {
    expect(shortBandName('Jane Blonde and the Goldfingers')).toBe('Jane Blonde');
    expect(shortBandName('Jane Blonde & the Goldfingers')).toBe('Jane Blonde');
  });

  it('keeps names without "and the"', () => {
    expect(shortBandName('ROCKSOLID')).toBe('ROCKSOLID');
    expect(shortBandName('Andthe Band')).toBe('Andthe Band');
  });
});
