import { Plugin, Style } from '@opencode/plugin/gui';

import { addCommands } from './gui/command';
import { definition } from './gui/definition';
import { addHeaderSlot } from './gui/header';
import { addMenuItems } from './gui/menu';
import { addNotifications } from './gui/notifications';
import { addPanel } from './gui/panel';
import { addSettingsPage } from './gui/settings';
import { boardStyles } from './gui/styles';

/**
 * The desktop part: the board panel, the quick-board dialog, the command, the launcher item, the
 * header chip, rule notifications, and the settings page with its column and rule editors.
 */
export const setup: Plugin.Setup<typeof definition> = (ctx) => {
  ctx.add(Style, boardStyles);
  addPanel(ctx);
  addCommands(ctx);
  addMenuItems(ctx);
  addHeaderSlot(ctx);
  addSettingsPage(ctx);

  return addNotifications(ctx);
};

export default Plugin.define({ ...definition, setup });
