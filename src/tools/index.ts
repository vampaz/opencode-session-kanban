import type { Plugin } from '@opencode/plugin';

import { startsAgent } from '../core/start';
import { BoardError, type Operations } from '../operations';
import { parseRule } from '../validate';
import { formatCardDetail, formatCardList, formatPreview, formatRules } from './format';
import {
  parseBoolean,
  parseCreateInput,
  parseListQuery,
  parseString,
  resolveSessionID,
  withRuleDefaults,
} from './parse';

type ToolDomain = Plugin.Context['tool'];
type ToolEditor = Parameters<Parameters<ToolDomain['transform']>[0]>[0];
type ToolInfo = Parameters<ToolEditor['add']>[0];
type ToolContext = Parameters<ToolInfo['execute']>[1];

const SESSION = 'Session id, or "me" for the session calling this tool.';
const COLUMN = 'Column id or title, for example "backlog" or "Waiting".';

const options = { namespace: 'kanban', codemode: true } as const;

/** The agent's board tools. They work with no window open and share the RPC operations. */
export function createKanbanTools(ctx: Plugin.Context, ops: Operations): ToolInfo[] {
  return [
    {
      name: 'list',
      description:
        'List the session board cards: session id, title, column, status, and project. Filter by column, project, status, or text. Status comes from the live server event stream; a session that changed before the server started shows idle until its next event, and waiting on a form is not visible to the server.',
      input: {
        type: 'object',
        properties: {
          column: { type: 'string', description: COLUMN },
          project: {
            type: 'string',
            description: 'Project id, or a project directory (exact or prefix).',
          },
          status: {
            type: 'string',
            description: 'idle, running, waiting, failed, or interrupted.',
          },
          text: { type: 'string', description: 'Case-insensitive text over title and project.' },
          includeSubagents: {
            type: 'boolean',
            description: 'Also list subagent sessions. Normally only roots and forks are cards.',
          },
        },
        additionalProperties: false,
      },
      options,
      execute: async (input) =>
        guarded(async () => {
          const query = parseListQuery(input);
          if (!query.ok) return query.message;

          const columnId = query.value.column
            ? (await ops.columnValue(query.value.column)).id
            : undefined;
          const cards = await ops.listCards({
            columnId,
            project: query.value.project,
            status: query.value.status,
            text: query.value.text,
            includeSubagents: query.value.includeSubagents,
          });

          return formatCardList(cards);
        }),
    },

    {
      name: 'get',
      description:
        'Show one session as a board card: column, placement, pin, status, project, agent, model, cost, and whether the board shows it.',
      input: {
        type: 'object',
        properties: { sessionID: { type: 'string', description: SESSION } },
        required: ['sessionID'],
        additionalProperties: false,
      },
      options,
      execute: async (input, context) => {
        const parsed = resolveSessionID(
          (input as { sessionID?: unknown }).sessionID,
          context.sessionID,
        );
        if (!parsed.ok) return { content: parsed.message };

        return guarded(async () => formatCardDetail(await ops.getCard(parsed.value)));
      },
    },

    {
      name: 'move',
      description:
        'Move a session card to a column. `column` takes a column id or title. The move counts as an agent placement: rules may still move the card, and it never starts the agent. Use `sessionID: "me"` to report your own state.',
      input: {
        type: 'object',
        properties: {
          sessionID: { type: 'string', description: SESSION },
          column: { type: 'string', description: COLUMN },
        },
        required: ['sessionID', 'column'],
        additionalProperties: false,
      },
      options,
      execute: async (input, context) => {
        const session = resolveSessionID(
          (input as { sessionID?: unknown }).sessionID,
          context.sessionID,
        );
        if (!session.ok) return { content: session.message };
        const column = parseString((input as { column?: unknown }).column, 'column');
        if (!column.ok) return { content: column.message };

        return guarded(async () => {
          const result = await ops.moveToColumn(session.value, column.value, 'agent');
          return `Moved ${session.value} to ${result.column.title} (${result.column.id}).`;
        });
      },
    },

    {
      name: 'pin',
      description:
        'Pin or unpin a card. A pinned card is skipped by rules unless the rule overrides manual placements.',
      input: {
        type: 'object',
        properties: {
          sessionID: { type: 'string', description: SESSION },
          pinned: { type: 'boolean', description: 'True to pin, false to unpin.' },
        },
        required: ['sessionID', 'pinned'],
        additionalProperties: false,
      },
      options,
      execute: async (input, context) => {
        const session = resolveSessionID(
          (input as { sessionID?: unknown }).sessionID,
          context.sessionID,
        );
        if (!session.ok) return { content: session.message };
        const pinned = parseBoolean((input as { pinned?: unknown }).pinned, 'pinned');
        if (!pinned.ok) return { content: pinned.message };

        return guarded(async () => {
          await ops.requireSession(session.value);
          await ops.setPinned(ops.sessionKey(session.value), pinned.value);
          return `${pinned.value ? 'Pinned' : 'Unpinned'} ${session.value}.`;
        });
      },
    },

    {
      name: 'clear_manual',
      description:
        "Clear a card's manual placement. The card returns to the default column and rules may move it again.",
      input: {
        type: 'object',
        properties: { sessionID: { type: 'string', description: SESSION } },
        required: ['sessionID'],
        additionalProperties: false,
      },
      options,
      execute: async (input, context) => {
        const session = resolveSessionID(
          (input as { sessionID?: unknown }).sessionID,
          context.sessionID,
        );
        if (!session.ok) return { content: session.message };

        return guarded(async () => {
          await ops.requireSession(session.value);
          await ops.clearManual(ops.sessionKey(session.value));
          return `Cleared the manual placement of ${session.value}.`;
        });
      },
    },

    {
      name: 'archive',
      description:
        'Archive or unarchive a session. Archiving removes its card and hides its forks. The tool verifies the change and reports when this server build ignores archive requests. Needs the kanban.archive permission.',
      input: {
        type: 'object',
        properties: {
          sessionID: { type: 'string', description: SESSION },
          archived: { type: 'boolean', description: 'True to archive, false to restore.' },
        },
        required: ['sessionID', 'archived'],
        additionalProperties: false,
      },
      options,
      execute: async (input, context) => {
        const session = resolveSessionID(
          (input as { sessionID?: unknown }).sessionID,
          context.sessionID,
        );
        if (!session.ok) return { content: session.message };
        const archived = parseBoolean((input as { archived?: unknown }).archived, 'archived');
        if (!archived.ok) return { content: archived.message };

        return guarded(async () => {
          await ops.requireSession(session.value);
          await requirePermission(ctx, context, 'kanban.archive', [session.value]);
          await ops.archive(session.value, archived.value);

          return archived.value
            ? `Archived ${session.value}. Its card is hidden and its forks follow it.`
            : `Unarchived ${session.value}.`;
        });
      },
    },

    {
      name: 'fork',
      description:
        'Fork a session, copying its history. Not available from the server in this OpenCode build: the server session API has no fork call. Use the Fork… action on the board card in the desktop app.',
      input: {
        type: 'object',
        properties: {
          sessionID: { type: 'string', description: SESSION },
          column: {
            type: 'string',
            description: `${COLUMN} Defaults to the source card's column.`,
          },
        },
        required: ['sessionID'],
        additionalProperties: false,
      },
      options,
      execute: async (input, context) => {
        const session = resolveSessionID(
          (input as { sessionID?: unknown }).sessionID,
          context.sessionID,
        );
        if (!session.ok) return { content: session.message };

        return { content: ops.forkUnavailable().message };
      },
    },

    {
      name: 'create_session',
      description:
        'Create a session in a project directory and place its card in a column. A task starts the agent in a column that starts agents (needs the kanban.prompt permission); otherwise it is queued on the card until the card moves to such a column.',
      input: {
        type: 'object',
        properties: {
          directory: {
            type: 'string',
            description: 'Absolute project directory, for example /Users/me/work/app.',
          },
          column: { type: 'string', description: COLUMN },
          title: { type: 'string', description: 'Optional session title.' },
          prompt: {
            type: 'string',
            description:
              'Optional task. It starts the agent and costs tokens in a starting column, or waits queued on the card.',
          },
        },
        required: ['directory', 'column'],
        additionalProperties: false,
      },
      options,
      execute: async (input, context) => {
        const parsed = parseCreateInput(input);
        if (!parsed.ok) return { content: parsed.message };

        return guarded(async () => {
          const column = await ops.columnValue(parsed.value.column);
          if (parsed.value.prompt && startsAgent(column)) {
            await requirePermission(ctx, context, 'kanban.prompt', [parsed.value.directory]);
          }

          const result = await ops.createInColumn(parsed.value);
          const suffix = result.started
            ? ' The task is running.'
            : !result.queued
              ? ''
              : startsAgent(result.column)
                ? ' The agent did not start; the task waits on the card.'
                : ' The task waits on the card until a starting column.';
          return `Created ${result.session.id} in ${result.column.title} (${result.column.id}).${suffix}`;
        });
      },
    },

    {
      name: 'list_rules',
      description:
        'List the board rules in priority order: id, name, enabled state, triggers, and actions.',
      input: { type: 'object', properties: {}, additionalProperties: false },
      options,
      execute: async () =>
        guarded(async () => {
          const [rules, columns] = await Promise.all([ops.rules(), ops.columns()]);
          return formatRules(rules, columns);
        }),
    },

    {
      name: 'set_rule',
      description:
        'Create or update a rule, or remove one with remove: true and its id. Omitted fields take defaults: enabled, priority 0, trigger created, match all, no conditions, no actions. Actions are move, pin, and notify; there is no archive action. Needs the kanban.rules permission.',
      input: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Rule id. Omit to create one.' },
          name: { type: 'string' },
          enabled: { type: 'boolean' },
          priority: {
            type: 'number',
            description: 'Lower runs first. The first matching rule wins per session and event.',
          },
          trigger: {
            type: 'array',
            items: { type: 'string' },
            description:
              'status.running, status.idle, run.succeeded, run.failed, run.interrupted, waiting.permission, waiting.form, created, idle.for',
          },
          match: { type: 'string', description: 'all or any conditions.' },
          conditions: {
            type: 'array',
            items: { type: 'object' },
            description:
              'Conditions: directory (prefix|eq), project (eq), title (contains|matches), agent (eq), root (boolean), cost (gt), idleMinutes (gt).',
          },
          actions: {
            type: 'array',
            items: { type: 'object' },
            description: 'Actions: {type:"move",toColumn}, {type:"pin",pinned}, {type:"notify"}.',
          },
          overrideManual: { type: 'boolean' },
          cooldownMs: { type: 'number' },
        },
        remove: {
          type: 'boolean',
          description: 'When true, delete the rule with the given id instead of saving it.',
        },
        additionalProperties: false,
      },
      options,
      execute: async (input, context) => {
        const removing = (input as { remove?: unknown }).remove === true;
        if (removing) {
          const id = parseString((input as { id?: unknown }).id, 'id');
          if (!id.ok) return { content: `${id.message} Pass the rule id with remove: true.` };

          return guarded(async () => {
            await requirePermission(ctx, context, 'kanban.rules', [id.value]);
            await ops.removeRule(id.value);
            return `Removed rule ${id.value}.`;
          });
        }

        let rule;
        try {
          rule = parseRule(withRuleDefaults(input));
        } catch (cause) {
          return { content: `Invalid rule: ${messageOf(cause)}` };
        }

        return guarded(async () => {
          await requirePermission(ctx, context, 'kanban.rules', [rule.id]);
          await ops.upsertRule(rule);
          return `Saved rule ${rule.id} (${rule.name}), priority ${rule.priority}, ${rule.enabled ? 'enabled' : 'disabled'}.`;
        });
      },
    },

    {
      name: 'preview_rules',
      description:
        'Dry run the rules: list the moves that would happen now, without applying any of them.',
      input: { type: 'object', properties: {}, additionalProperties: false },
      options,
      execute: async () =>
        guarded(async () => {
          const [moves, columns] = await Promise.all([ops.preview(), ops.columns()]);
          return formatPreview(moves, columns);
        }),
    },
  ];
}

async function guarded(run: () => Promise<string>): Promise<{ content: string }> {
  try {
    return { content: await run() };
  } catch (cause) {
    if (cause instanceof BoardError) return { content: cause.message };
    throw cause;
  }
}

async function requirePermission(
  ctx: Plugin.Context,
  context: ToolContext,
  action: string,
  resources: readonly string[],
): Promise<void> {
  await ctx.permission.assert({
    sessionID: context.sessionID,
    agent: context.agent,
    source: { type: 'tool', messageID: context.messageID, id: context.id },
    action,
    resources: [...resources],
    save: [...resources],
  });
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
