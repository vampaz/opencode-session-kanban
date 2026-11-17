import { Plugin } from '@opencode/plugin';

/**
 * The server part: the board document in plugin storage, the rules engine, the agent tools, and
 * the RPC implementation. The scaffold registers a valid plugin with no contributions yet.
 */
export default Plugin.define({
  id: 'kanban',
  setup() {},
});
