import { Plugin, Style } from '@opencode/plugin/gui';

import { addCommands } from './gui/command';
import { definition } from './gui/definition';
import { addHeaderSlot } from './gui/header';
import { addMenuItems } from './gui/menu';
import { addPanel } from './gui/panel';
import { boardStyles } from './gui/styles';

/**
 * The desktop part: the board panel, the quick-board dialog, the command, the launcher item, and
 * the header chip. The rules editor and the settings page arrive with the features they drive.
 */
export const setup: Plugin.Setup<typeof definition> = (ctx) => {
  ctx.add(Style, boardStyles);
  addPanel(ctx);
  addCommands(ctx);
  addMenuItems(ctx);
  addHeaderSlot(ctx);
};

export default Plugin.define({ ...definition, setup });
