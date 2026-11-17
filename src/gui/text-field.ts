/** What a text field stores when the user submits it or moves focus away. */
export type TextCommit =
  | { readonly kind: 'save'; readonly value: string }
  | { readonly kind: 'revert' }
  | { readonly kind: 'none' };

/**
 * Decides what a text field does when the user finishes editing: save a changed, non-empty value,
 * revert an empty one, and leave an unchanged one alone.
 */
export function commitText(draft: string, stored: string): TextCommit {
  const value = draft.trim();
  if (!value) return { kind: 'revert' };
  if (value === stored) return { kind: 'none' };
  return { kind: 'save', value };
}
