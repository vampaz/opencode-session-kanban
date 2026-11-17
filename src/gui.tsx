import { Plugin } from '@opencode/plugin/gui';

import { definition } from './gui/definition';

/**
 * The desktop part: the board panel, the quick-board dialog, the command, the launcher item, the
 * header chip, and the settings page. The scaffold wires no surface yet.
 */
export const setup: Plugin.Setup<typeof definition> = () => {};

export default Plugin.define({ ...definition, setup });
