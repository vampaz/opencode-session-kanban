import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FILTERS,
  filterCards,
  isFiltering,
  matchesFilters,
  type FilterableCard,
} from './filter';

const card: FilterableCard = {
  title: 'Fix the board',
  directory: '/work/session-kanban',
  subpath: 'src/gui',
  status: 'running',
};

describe('matchesFilters', () => {
  it('matches everything by default', () => {
    expect(matchesFilters(card, DEFAULT_FILTERS)).toBe(true);
  });

  it('filters by text across title, directory, and subpath', () => {
    expect(matchesFilters(card, { ...DEFAULT_FILTERS, text: 'BOARD' })).toBe(true);
    expect(matchesFilters(card, { ...DEFAULT_FILTERS, text: 'session-kanban' })).toBe(true);
    expect(matchesFilters(card, { ...DEFAULT_FILTERS, text: 'src/gui' })).toBe(true);
    expect(matchesFilters(card, { ...DEFAULT_FILTERS, text: 'missing' })).toBe(false);
  });

  it('filters by project and status', () => {
    expect(matchesFilters(card, { ...DEFAULT_FILTERS, project: '/work/session-kanban' })).toBe(
      true,
    );
    expect(matchesFilters(card, { ...DEFAULT_FILTERS, project: '/work/other' })).toBe(false);
    expect(matchesFilters(card, { ...DEFAULT_FILTERS, status: 'running' })).toBe(true);
    expect(matchesFilters(card, { ...DEFAULT_FILTERS, status: 'waiting' })).toBe(false);
  });

  it('keeps only running and waiting cards when asked for attention', () => {
    const filters = { ...DEFAULT_FILTERS, attentionOnly: true };

    expect(matchesFilters(card, filters)).toBe(true);
    expect(matchesFilters({ ...card, status: 'waiting' }, filters)).toBe(true);
    expect(matchesFilters({ ...card, status: 'idle' }, filters)).toBe(false);
    expect(matchesFilters({ ...card, status: 'failed' }, filters)).toBe(false);
  });

  it('combines filters', () => {
    expect(
      matchesFilters(card, {
        ...DEFAULT_FILTERS,
        text: 'board',
        project: '/work/session-kanban',
        status: 'running',
        attentionOnly: true,
      }),
    ).toBe(true);
    expect(matchesFilters(card, { ...DEFAULT_FILTERS, text: 'board', status: 'idle' })).toBe(false);
  });
});

describe('filterCards', () => {
  it('keeps the order of the cards it passes', () => {
    const cards = [
      { ...card, title: 'one' },
      { ...card, title: 'two', status: 'idle' as const },
      { ...card, title: 'three' },
    ];

    expect(
      filterCards(cards, { ...DEFAULT_FILTERS, status: 'running' }).map((item) => item.title),
    ).toEqual(['one', 'three']);
  });
});

describe('isFiltering', () => {
  it('is false only for the default view', () => {
    expect(isFiltering(DEFAULT_FILTERS)).toBe(false);
    expect(isFiltering({ ...DEFAULT_FILTERS, text: ' ' })).toBe(false);
    expect(isFiltering({ ...DEFAULT_FILTERS, text: 'x' })).toBe(true);
    expect(isFiltering({ ...DEFAULT_FILTERS, attentionOnly: true })).toBe(true);
  });
});
