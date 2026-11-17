import { Plugin } from '@opencode/plugin/gui';

import { addCommands } from './gui/command';
import { definition } from './gui/definition';
import { addPanel } from './gui/panel';

/**
 * The desktop part: the board panel, the quick-board dialog, and the command that toggles them.
 * The launcher item, header chip, and settings page arrive with the board features they drive.
 */
export const setup: Plugin.Setup<typeof definition> = (ctx) => {
  addPanel(ctx);
  addCommands(ctx);
};

export default Plugin.define({ ...definition, setup });
