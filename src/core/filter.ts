import type { CardStatus } from './status';

/** View preferences. Window-local, never stored on the server. */
export type BoardFilters = {
  readonly text: string;
  readonly project: string;
  readonly status: 'all' | CardStatus;
  readonly attentionOnly: boolean;
};

export const DEFAULT_FILTERS: BoardFilters = {
  text: '',
  project: '',
  status: 'all',
  attentionOnly: false,
};

export type FilterableCard = {
  readonly title: string;
  readonly directory: string;
  readonly subpath?: string | undefined;
  readonly status: CardStatus;
};

export function isFiltering(filters: BoardFilters): boolean {
  return (
    filters.text.trim() !== '' ||
    filters.project !== '' ||
    filters.status !== 'all' ||
    filters.attentionOnly
  );
}

export function matchesFilters(card: FilterableCard, filters: BoardFilters): boolean {
  if (filters.attentionOnly && card.status !== 'running' && card.status !== 'waiting') return false;
  if (filters.status !== 'all' && card.status !== filters.status) return false;
  if (filters.project && card.directory !== filters.project) return false;

  const text = filters.text.trim().toLowerCase();
  if (text) {
    const haystack = `${card.title} ${card.directory} ${card.subpath ?? ''}`.toLowerCase();
    if (!haystack.includes(text)) return false;
  }

  return true;
}

export function filterCards<T extends FilterableCard>(
  cards: readonly T[],
  filters: BoardFilters,
): T[] {
  return cards.filter((card) => matchesFilters(card, filters));
}
