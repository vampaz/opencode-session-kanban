import { DEFAULT_FILTERS, type BoardFilters } from '../core/filter';
import type { UiContext } from './client';

/** The filters as a mutable draft, which is how a window store edits them. */
export type ViewFilters = { -readonly [Key in keyof BoardFilters]: BoardFilters[Key] };

/**
 * View preferences for this window. A memory store survives a plugin reload but not a window reload,
 * and never reaches the server.
 */
export function useViewFilters(ctx: UiContext) {
  const [filters, edit] = ctx.storage.memory<ViewFilters>('view', {
    initial: { ...DEFAULT_FILTERS },
  });

  function set<Key extends keyof ViewFilters>(key: Key, value: ViewFilters[Key]): void {
    edit((draft) => {
      draft[key] = value;
    });
  }

  function reset(): void {
    edit((draft) => {
      Object.assign(draft, DEFAULT_FILTERS);
    });
  }

  return { filters: (): BoardFilters => filters, set, reset };
}
