/** The slice of a session that says whether it is archived. */
export type ArchiveState = {
  readonly time?:
    | { readonly archived?: number | undefined; readonly [key: string]: unknown }
    | undefined;
};

export type ArchiveApi = {
  update(input: { readonly sessionID: string; readonly archived: boolean }): Promise<void>;
  get(input: { readonly sessionID: string }): Promise<ArchiveState>;
};

export function isArchived(session: ArchiveState): boolean {
  return session.time?.archived !== undefined;
}

/**
 * Sets the flag and checks the result. Some server builds accept `archived` in the input and then
 * ignore it, so the caller must not report success without this read-back.
 */
export async function performArchive(
  api: ArchiveApi,
  sessionID: string,
  archived: boolean,
): Promise<boolean> {
  await api.update({ sessionID, archived });
  const after = await api.get({ sessionID });
  return isArchived(after) === archived;
}
