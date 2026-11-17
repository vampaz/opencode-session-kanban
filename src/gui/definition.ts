import { Plugin } from '@opencode/plugin/gui';

export const definition = Plugin.define({
  i18n: {
    en: {
      'board.title': 'Session board',
      'board.diagnostics': 'M0 diagnostics',
      'board.instance': 'Served by {{instance}} · pid {{pid}}',
      'board.serving': 'Directory {{directory}} · since {{time}}',
      'board.routed': 'Routed session directory {{directory}}',
      'board.state': 'Revision {{revision}} · {{connection}}',
      'board.connected': 'connected',
      'board.disconnected': 'disconnected',
      'board.error': 'The board is unavailable: {{message}}',
      'board.dropHere': 'Drop a card here',
      'command.open': 'Open session board',
      'dialog.close': 'Close',
      'settings.placeholder': 'Columns and rules arrive in a later milestone.',
    },
  },
});
