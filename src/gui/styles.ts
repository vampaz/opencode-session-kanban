/**
 * The board's own CSS. Colours come from the app's theme tokens, so light and dark themes both
 * apply, and the running dot stops moving when the user prefers reduced motion.
 */
export const boardStyles = `
.sk-board {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--text-base, inherit);
  font-size: 0.85rem;
}

.sk-filters {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 8px 0;
}

.sk-filters__row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.sk-chip {
  font-variant-numeric: tabular-nums;
}

.sk-banner {
  margin: 8px 8px 0;
  padding: 6px 10px;
  border: 1px solid var(--v2-state-border-warning, var(--border-base, currentColor));
  border-radius: 8px;
  color: var(--v2-state-fg-warning, var(--text-base, inherit));
  font-size: 0.8rem;
}

.sk-center {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 24px 12px;
  text-align: center;
  color: var(--text-weak, inherit);
}

.sk-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  justify-content: center;
  min-height: 0;
  margin: 0;
  padding: 24px 12px;
  text-align: center;
  color: var(--text-weak, inherit);
}

.sk-detail {
  margin: 0;
  max-width: 42ch;
  overflow-wrap: anywhere;
  font-size: 0.75rem;
  color: var(--text-weaker, var(--text-weak, inherit));
}

.sk-columns {
  display: flex;
  flex: 1;
  gap: 8px;
  align-items: flex-start;
  /* Center the strip when a few capped columns leave free space; the safe keyword keeps the
     first column reachable while the strip overflows and scrolls. */
  justify-content: safe center;
  min-height: 0;
  padding: 8px;
  overflow: auto;
}

/* Columns share the width equally and stop growing at 360px, so cards stay readable. Below a
   200px minimum each the strip overflows and scrolls instead. */
.sk-column {
  display: flex;
  flex: 1 1 200px;
  flex-direction: column;
  gap: 6px;
  min-width: 200px;
  max-width: 360px;
  max-height: 100%;
  padding: 8px;
  overflow-y: auto;
  border: 1px solid var(--border-base, currentColor);
  border-radius: 8px;
  background: color-mix(in srgb, var(--text-base, currentColor) 4%, transparent);
}

.sk-column__head {
  display: flex;
  gap: 6px;
  align-items: baseline;
  justify-content: space-between;
  font-size: 0.78rem;
  font-weight: 600;
}

.sk-column__count {
  color: var(--text-weaker, var(--text-weak, inherit));
  font-variant-numeric: tabular-nums;
}

.sk-column__tools {
  display: flex;
  gap: 2px;
  align-items: center;
}

.sk-column--over {
  border-color: var(--border-selected, var(--border-base, currentColor));
  background: color-mix(in srgb, var(--text-base, currentColor) 9%, transparent);
}

.sk-column__empty {
  margin: 0;
  color: var(--text-weaker, var(--text-weak, inherit));
  font-size: 0.75rem;
}

.sk-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--border-base, currentColor);
  border-radius: 8px;
  background: var(--surface-raised-base, var(--surface-base, transparent));
  cursor: grab;
}

.sk-card:active {
  cursor: grabbing;
}

.sk-card--dragging {
  opacity: 0.45;
}

.sk-card--archived {
  opacity: 0.7;
  cursor: default;
}

.sk-card--fork {
  border-inline-start: 2px solid var(--border-interactive-base, var(--border-base, currentColor));
}

.sk-card__head {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  justify-content: space-between;
}

.sk-card__title {
  min-width: 0;
  overflow-wrap: anywhere;
  font-weight: 600;
  line-height: 1.3;
}

.sk-card__marker {
  flex: 0 0 auto;
  margin-top: 2px;
  color: var(--text-weaker, var(--text-weak, inherit));
}

.sk-card__pin {
  display: inline-flex;
  flex: 0 0 auto;
  margin-top: 2px;
  color: var(--text-weaker, var(--text-weak, inherit));
}

.sk-card__menu {
  flex: 0 0 auto;
  margin-inline-start: auto;
}

.sk-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  align-items: baseline;
  min-width: 0;
  color: var(--text-weak, inherit);
  font-size: 0.72rem;
}

/* Wrap first and truncate never: a short agent name must not become "b…". */
.sk-card__meta > span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.sk-card__task {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  color: var(--text-weak, inherit);
  font-size: 0.72rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sk-card__task::before {
  content: '▸ ';
}

.sk-status {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 5px;
  align-items: center;
  color: var(--text-weak, inherit);
  font-size: 0.72rem;
  white-space: nowrap;
}

.sk-status__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.sk-status--idle { color: var(--text-weaker, var(--text-weak, inherit)); }
.sk-status--running { color: var(--v2-state-fg-success, var(--text-base, inherit)); }
.sk-status--waiting { color: var(--v2-state-fg-warning, var(--text-base, inherit)); }
.sk-status--failed { color: var(--v2-state-fg-danger, var(--text-base, inherit)); }
.sk-status--interrupted { color: var(--text-weak, inherit); }

.sk-status--running .sk-status__dot {
  animation: sk-pulse 1.6s ease-in-out infinite;
}

@keyframes sk-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

@media (prefers-reduced-motion: reduce) {
  .sk-status--running .sk-status__dot { animation: none; }
}

.sk-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.sk-form__row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.sk-form__row > :first-child {
  flex: 1;
  min-width: 0;
}

.sk-settings {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.sk-settings__loading {
  display: flex;
  justify-content: center;
  padding: 24px;
}

.sk-settings__column {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-base, currentColor);
}

.sk-settings__column-main,
.sk-settings__column-start {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.sk-settings__column-start {
  padding-inline-start: 34px;
}

.sk-settings__rule {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-base, currentColor);
}

.sk-settings__grow {
  flex: 1;
  min-width: 0;
}

.sk-settings__name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.sk-settings__meta {
  color: var(--text-weak, inherit);
  font-size: 0.75rem;
  overflow-wrap: anywhere;
}

.sk-settings__control {
  min-width: 96px;
}

.sk-settings__add {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  min-width: 0;
}

.sk-settings__add > :first-child {
  flex: 1;
  min-width: 0;
}

.sk-settings__preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
  min-width: 0;
}

.sk-settings__moves {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 100%;
  text-align: end;
}

.sk-color {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border-base, currentColor);
  border-radius: 6px;
  background: transparent;
}

.sk-textarea {
  min-height: 220px;
  padding: 8px;
  color: var(--text-base, inherit);
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
  background: var(--surface-base, transparent);
  border: 1px solid var(--border-base, currentColor);
  border-radius: 8px;
  resize: vertical;
}

.sk-rule__group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.sk-rule__title {
  font-size: 0.8rem;
  font-weight: 600;
}

.sk-rule__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 4px 8px;
}

.sk-rule__condition {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: flex-end;
  min-width: 0;
}

.sk-rule__condition > * {
  min-width: 0;
}

.sk-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
`;
