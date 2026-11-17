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
  min-height: 0;
  padding: 8px;
  overflow: auto;
}

.sk-column {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 6px;
  width: 200px;
  min-width: 160px;
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

.sk-card__meta {
  display: flex;
  gap: 6px;
  align-items: baseline;
  min-width: 0;
  color: var(--text-weak, inherit);
  font-size: 0.72rem;
}

.sk-card__meta > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
