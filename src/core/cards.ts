import type { PlacementSource } from './board';
import type { CardStatus } from './status';

/** One board card as the tools report it. */
export type CardRow = {
  readonly sessionID: string;
  readonly title: string;
  readonly directory: string;
  readonly subpath?: string | undefined;
  readonly projectID: string;
  readonly columnId: string;
  readonly columnTitle: string;
  readonly status: CardStatus;
  readonly archived: boolean;
  readonly pinned: boolean;
  readonly source: PlacementSource;
  readonly updated: number;
};

export type CardFilter = {
  /** A resolved column id. */
  readonly columnId?: string | undefined;
  /** A project id, or a directory (exact or prefix). */
  readonly project?: string | undefined;
  readonly status?: CardStatus | undefined;
  /** Case-insensitive text over the title, directory, and subpath. */
  readonly text?: string | undefined;
};

export function filterCardRows(rows: readonly CardRow[], filter: CardFilter): CardRow[] {
  const text = filter.text?.trim().toLowerCase();

  return rows.filter((row) => {
    if (filter.columnId && row.columnId !== filter.columnId) return false;
    if (filter.status && row.status !== filter.status) return false;

    if (filter.project) {
      const project = filter.project.trim();
      const matches =
        row.projectID === project ||
        row.directory === project ||
        row.directory.startsWith(project.endsWith('/') ? project : `${project}/`);
      if (!matches) return false;
    }

    if (text) {
      const haystack = `${row.title} ${row.directory} ${row.subpath ?? ''}`.toLowerCase();
      if (!haystack.includes(text)) return false;
    }

    return true;
  });
}
