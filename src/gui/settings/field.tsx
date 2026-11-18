import { createEffect, createSignal } from 'solid-js';

import type { UiContext } from '../client';
import { commitText } from '../text-field';

/**
 * A text field that saves its value on Enter and when focus leaves it. A snapshot refresh replaces
 * the `value` prop on every change, so the field keeps its draft while the user edits it instead of
 * overwriting what they typed.
 */
export function SavedTextInput(props: {
  ctx: UiContext;
  class?: string;
  label: string;
  placeholder?: string;
  value: string;
  /** Save an empty value instead of reverting, for a field that can be cleared. */
  allowEmpty?: boolean;
  onSave(value: string): void;
}) {
  const [draft, setDraft] = createSignal(props.value);
  const [editing, setEditing] = createSignal(false);
  const ctx = props.ctx;
  let saved = props.value;
  let seen = props.value;

  createEffect(() => {
    const stored = props.value;
    if (stored === seen) return;
    seen = stored;
    saved = stored;
    if (!editing()) setDraft(stored);
  });

  function commit(): void {
    const decision = commitText(draft(), saved, { allowEmpty: props.allowEmpty === true });
    if (decision.kind === 'save') {
      saved = decision.value;
      setDraft(decision.value);
      props.onSave(decision.value);
      return;
    }
    if (decision.kind === 'revert') setDraft(saved);
  }

  return (
    <div
      class={props.class}
      onFocusIn={() => setEditing(true)}
      onFocusOut={() => {
        setEditing(false);
        commit();
      }}
      on:keydown={(event: KeyboardEvent) => {
        if (event.key !== 'Escape' || !editing()) return;
        event.preventDefault();
        event.stopPropagation();
        setDraft(saved);
        setEditing(false);
        if (event.target instanceof HTMLElement) event.target.blur();
      }}
    >
      <ctx.ui.TextInput
        label={props.label}
        placeholder={props.placeholder}
        value={draft()}
        onInput={setDraft}
        onSubmit={commit}
      />
    </div>
  );
}
