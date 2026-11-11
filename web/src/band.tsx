import { createContext, useContext } from 'react';

export interface Band {
  name: string;
  slug: string;
}

/** The band being worked in. Templates fill {band} from the name, links use the slug as their source. */
export const BandContext = createContext<Band>({ name: '', slug: '' });
export const useBand = (): Band => useContext(BandContext);
export const useBandName = (): string => useContext(BandContext).name;

/**
 * A short name for the header, where a phone has room for about a dozen letters:
 * "Jane Blonde and the Goldfingers" becomes "Jane Blonde". Names without "and the" are kept.
 */
export function shortBandName(name: string): string {
  const cut = name.search(/\s+(and|&)\s+the\s+/i);
  return cut > 0 ? name.slice(0, cut) : name;
}
