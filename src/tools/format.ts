import type { Column } from '../core/board';
import type { CardRow } from '../core/cards';
import type { PreviewMove, Rule } from '../core/rules';
import { projectLabel } from '../core/status';
import type { CardDetail } from '../operations';

export function formatCardLine(row: CardRow): string {
  const flags = [row.columnTitle, row.status];
  if (row.pinned) flags.push('pinned');
  else flags.push(row.source);
  if (row.archived) flags.push('archived');
  const project = projectLabel(row.directory, row.subpath);
  return `- ${row.sessionID} · ${row.title} — ${flags.join(' · ')} · ${project}`;
}

export function formatCardList(rows: readonly CardRow[]): string {
  if (rows.length === 0) return 'No cards match.';
  return rows.map(formatCardLine).join('\n');
}

export function formatCardDetail(detail: CardDetail): string {
  const { card, session, visible } = detail;
  const model = session.model ? `${session.model.providerID}/${session.model.id}` : 'none';
  const agent = session.agent ?? 'none';

  return [
    `${card.sessionID} · ${card.title}`,
    `Column: ${card.columnTitle} (${card.columnId}) · placement: ${card.source}${card.pinned ? ' · pinned' : ''}`,
    `Status: ${card.status}${card.archived ? ' · archived' : ''} · visible on the board: ${visible ? 'yes' : 'no'}`,
    `Project: ${projectLabel(card.directory, card.subpath)} (${card.directory})`,
    `Agent: ${agent} · Model: ${model} · Cost: ${session.cost}`,
    `Updated: ${new Date(card.updated).toISOString()}`,
  ].join('\n');
}

export function formatRules(rules: readonly Rule[], columns: readonly Column[]): string {
  if (rules.length === 0) return 'No rules yet.';

  const columnTitle = (id: string) => columns.find((column) => column.id === id)?.title ?? id;

  return rules
    .map((rule) => {
      const triggers = rule.trigger.join(', ');
      const actions = rule.actions
        .map((action) => {
          if (action.type === 'move') return `move → ${columnTitle(action.toColumn)}`;
          if (action.type === 'pin') return action.pinned ? 'pin' : 'unpin';
          return 'notify';
        })
        .join(', ');

      return `- ${rule.id} · ${rule.name} — ${rule.enabled ? 'enabled' : 'disabled'} · priority ${rule.priority}\n  triggers: ${triggers} · actions: ${actions || 'none'}`;
    })
    .join('\n');
}

export function formatPreview(moves: readonly PreviewMove[], columns: readonly Column[]): string {
  if (moves.length === 0) return 'No moves would happen now.';

  const columnTitle = (id: string) => columns.find((column) => column.id === id)?.title ?? id;

  return moves
    .map((move) => {
      const sessionID = move.sessionKey.slice(move.sessionKey.indexOf('\n') + 1);
      return `- ${sessionID}: ${columnTitle(move.from)} → ${columnTitle(move.to)} (${move.ruleID})`;
    })
    .join('\n');
}
