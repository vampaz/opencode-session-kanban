import type { BoardDocument, BoardSettings } from '../../core/board';
import type { PreviewMove } from '../../core/rules';
import type { UiContext } from '../client';

/** The document and writers the settings sections share with the page shell. */
export type SettingsApi = {
  readonly ctx: UiContext;
  readonly document: () => BoardDocument | undefined;
  /** Previewed rule moves, shared so a reset or a rule delete can clear them. */
  readonly moves: () => PreviewMove[] | undefined;
  readonly setMoves: (moves: PreviewMove[] | undefined) => void;
  readonly run: <T>(operation: () => Promise<T>) => Promise<T | undefined>;
  readonly refresh: () => Promise<void>;
  readonly setError: (message: string | undefined) => void;
  readonly setSetting: <Key extends keyof BoardSettings>(
    key: Key,
    value: BoardSettings[Key],
  ) => void;
  readonly setDefaultColumn: (id: string) => void;
  readonly columnTitle: (id: string) => string;
  readonly sessionTitle: (sessionKey: string) => string;
};

export function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
