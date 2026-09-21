const DEFAULT_ID = 'dsh-qa';
const DEFAULT_LABEL = '质量工作台';
const DEFAULT_WORKBENCH_URL = '/api/dsh-qa/workbench/';

/**
 * The semantic identity shared by the Harness sidebar and main slots.
 *
 * The browser runtime lives in lib/client.js because Harness loads that file
 * as a raw ModuleLoader bundle. Keep this module limited to the contract so
 * unit tests do not maintain a second iframe renderer or host adapter.
 */
export function createDshQaPanelDefinition({
  id = DEFAULT_ID,
  label = DEFAULT_LABEL,
  icon,
  workbenchUrl = DEFAULT_WORKBENCH_URL,
} = {}) {
  if (typeof id !== 'string' || id.length === 0) throw new TypeError('Panel id must be a non-empty string');
  if (typeof label !== 'string' || label.length === 0) throw new TypeError('Panel label must be a non-empty string');
  if (typeof workbenchUrl !== 'string' || workbenchUrl.length === 0) throw new TypeError('Workbench URL must be a non-empty string');

  return {
    sidebarSlot: {
      name: 'sidebar.panellist',
      id,
      label,
      icon,
    },
    mainSlot: {
      name: 'main',
      key: id,
      workbenchUrl,
    },
  };
}
