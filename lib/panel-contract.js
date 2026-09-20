const DEFAULT_ID = 'dsh-qa';
const DEFAULT_LABEL = '质量工作台';
const DEFAULT_WORKBENCH_URL = '/api/dsh-qa/workbench/';
const DEFAULT_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="5.8"/><path d="M5.6 8.2 7.4 10l3-3.6"/></svg>';
const POPOUT_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3.5H3v9h9v-3.5"/><path d="M9 2h5v5"/><path d="M7.5 8.5 14 2"/></svg>';
const CLOSE_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

/**
 * Create the semantic identity shared by the Harness sidebar list and main slot.
 * Host-specific registration options stay inside registerDshQaPanel().
 */
export function createDshQaPanelDefinition({
  id = DEFAULT_ID,
  label = DEFAULT_LABEL,
  icon = DEFAULT_ICON,
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

/**
 * Register one dsh-qa panel through the official Harness slot API.
 *
 * The injected registrations follow the declaration lifetime of the host's
 * sidebar and root slots. The returned disposer releases both waits and their
 * active registrations, making unload and panel replacement idempotent.
 */
export function registerDshQaPanel(ctx, definition) {
  const sidebar = definition.sidebarSlot;
  const main = definition.mainSlot;
  const disposers = [];

  try {
    disposers.push(ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist',
      id: sidebar.id,
      label: sidebar.label,
    }, createPanelIcon(sidebar.icon))));

    disposers.push(ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main',
      key: main.key,
    }, createWorkbenchPanel(main.workbenchUrl, () => ctx.layout.selectPanel(null)))));
  } catch (error) {
    for (let index = disposers.length - 1; index >= 0; index -= 1) disposers[index]();
    throw error;
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (let index = disposers.length - 1; index >= 0; index -= 1) disposers[index]();
  };
}

function createPanelIcon(icon) {
  return ({ size, active }) => {
    if (typeof icon === 'function') return icon({ size, active });
    const react = getReact();
    return react.createElement('span', {
      'aria-hidden': 'true',
      'data-dsh-qa-panel-icon': '',
      'data-active': active ? 'true' : undefined,
      style: { display: 'inline-flex', width: size, height: size, alignItems: 'center', justifyContent: 'center' },
      dangerouslySetInnerHTML: { __html: String(icon ?? '') },
    });
  };
}

function createWorkbenchPanel(workbenchUrl, closePanel) {
  return function WorkbenchPanel() {
    const react = getReact();
    const frameRef = react.useRef(null);

    react.useEffect(() => {
      const onMessage = (event) => {
        if (event.origin !== window.location.origin) return;
        if (frameRef.current !== null && event.source !== frameRef.current.contentWindow) return;
        const data = event.data;
        if (data?.source === 'dsh-qa' && data?.type === 'close-panel') closePanel();
      };
      window.addEventListener('message', onMessage);
      return () => window.removeEventListener('message', onMessage);
    }, []);

    return react.createElement('div', { style: styles.panel }, [
      react.createElement('div', { key: 'bar', style: styles.bar }, [
        react.createElement('span', { key: 'title', style: styles.title }, '质量工作台 · QA Workbench'),
        react.createElement('span', { key: 'actions', style: styles.actions }, [
          react.createElement('button', {
            key: 'popout',
            type: 'button',
            title: '在标签页打开',
            'aria-label': '在标签页打开',
            style: styles.button,
            onClick: () => { try { window.open(workbenchUrl, '_blank', 'noopener'); } catch { /* ignore */ } },
            dangerouslySetInnerHTML: { __html: POPOUT_ICON },
          }),
          react.createElement('button', {
            key: 'close',
            type: 'button',
            title: '关闭',
            'aria-label': '关闭',
            style: styles.button,
            onClick: closePanel,
            dangerouslySetInnerHTML: { __html: CLOSE_ICON },
          }),
        ]),
      ]),
      react.createElement('iframe', {
        key: 'frame',
        ref: frameRef,
        title: '质量工作台',
        src: workbenchUrl,
        sandbox: 'allow-same-origin allow-scripts allow-forms allow-popups allow-downloads',
        style: styles.frame,
      }),
    ]);
  };
}

function getReact() {
  if (typeof React === 'undefined') throw new Error('Harness React runtime is unavailable');
  return React;
}

const styles = {
  panel: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--dsw-alias-bg-base, #fff)' },
  bar: { flex: 'none', display: 'flex', alignItems: 'center', gap: 10, height: 42, padding: '0 10px 0 14px', borderBottom: '1px solid var(--dsw-alias-border-l2, #e4e9f2)', background: 'var(--dsw-alias-bg-base, #fff)' },
  title: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #1c2333)' },
  actions: { display: 'flex', gap: 4, alignItems: 'center' },
  button: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: 0, borderRadius: 7, background: 'transparent', color: 'var(--dsw-alias-label-secondary, #5b6478)', cursor: 'pointer' },
  frame: { flex: 1, minHeight: 0, width: '100%', border: 0, background: '#eef3f9' },
};
