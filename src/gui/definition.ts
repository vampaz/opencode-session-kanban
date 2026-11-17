import { Plugin } from '@opencode/plugin/gui';

export const definition = Plugin.define({
  i18n: {
    en: {
      'board.title': 'Session board',
      'board.loading': 'Loading the board…',
      'board.error': 'The board is unavailable.',
      'board.retry': 'Retry',
      'board.stale': 'Offline. Showing the last snapshot.',
      'board.empty': 'No sessions yet.',
      'board.emptyFiltered': 'No sessions match these filters.',
      'board.columnEmpty': 'Empty',
      'card.fork': 'Fork',
      'card.untitled': 'Untitled session',
      'status.idle': 'Idle',
      'status.running': 'Running',
      'status.waiting': 'Waiting',
      'status.failed': 'Failed',
      'status.interrupted': 'Interrupted',
      'filters.text': 'Filter sessions',
      'filters.textHint': 'Title or project',
      'filters.allProjects': 'All projects',
      'filters.anyStatus': 'Any status',
      'filters.attention': 'Running or waiting only',
      'filters.clear': 'Clear filters',
      'command.open': 'Open session board',
      'command.openDescription': 'Show the sessions of every project on one board',
      'dialog.close': 'Close',
      'header.summary': '{{running}} running · {{waiting}} waiting',
      'settings.placeholder': 'Columns and rules arrive in a later milestone.',
    },
  },
});
