/**
 * dsh-qa browser half: official Harness Panel/Slot registration plus the
 * existing Workbench iframe. Panel selection belongs to Harness; this module
 * only contributes one sidebar entry and one matching main panel. Harness
 * provides the React runtime; dsh-qa does not bundle it as a production dep.
 */
window.__ModuleLoader__.load({
  id: 'dsh-qa',
  factory: function (require) {
    'use strict';
    var exports = {};
    var inject = ['slots', 'layout'];
    var React = typeof require === 'function' ? require('react') : window.React;

    var VIEW_URL = '/api/dsh-qa/workbench/';
    var ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="5.8"/><path d="M5.6 8.2 7.4 10l3-3.6"/></svg>';
    var POPOUT_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3.5H3v9h9v-3.5"/><path d="M9 2h5v5"/><path d="M7.5 8.5 14 2"/></svg>';
    var CLOSE_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

    function createDshQaPanelDefinition(options) {
      var input = options || {};
      var id = input.id || 'dsh-qa';
      var label = input.label || '质量工作台';
      var icon = input.icon || ICON;
      var workbenchUrl = input.workbenchUrl || VIEW_URL;
      return {
        sidebarSlot: { name: 'sidebar.panellist', id: id, label: label, icon: icon },
        mainSlot: { name: 'main', key: id, workbenchUrl: workbenchUrl },
      };
    }

    function registerDshQaPanel(ctx, definition) {
      var sidebar = definition.sidebarSlot;
      var main = definition.mainSlot;
      var disposers = [];
      try {
        disposers.push(ctx.slots.inject('sidebar.panellist', function () {
          return ctx.slots.register({ name: 'sidebar.panellist', id: sidebar.id, label: sidebar.label }, createPanelIcon(sidebar.icon));
        }));
        disposers.push(ctx.slots.inject('main', function () {
          return ctx.slots.register({ name: 'main', key: main.key }, createWorkbenchPanel(main.workbenchUrl, function () {
            ctx.layout.selectPanel(null);
          }));
        }));
      } catch (error) {
        for (var index = disposers.length - 1; index >= 0; index -= 1) {
          if (typeof disposers[index] === 'function') disposers[index]();
        }
        throw error;
      }

      var disposed = false;
      return function () {
        if (disposed) return;
        disposed = true;
        for (var index = disposers.length - 1; index >= 0; index -= 1) {
          if (typeof disposers[index] === 'function') disposers[index]();
        }
      };
    }

    function reportPanelRegistrationError(error) {
      try {
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error('[dsh-qa] Harness Panel registration failed', error);
        }
      } catch (loggingError) { /* keep the user-facing failure path available */ }
      try {
        if (typeof window.alert === 'function') {
          window.alert('质量工作台暂不可用：Harness Panel 注册失败，请刷新 DSH 后重试。');
        }
      } catch (alertError) { /* hosts may disable alert */ }
    }

    function createPanelIcon(icon) {
      return function (props) {
        if (typeof icon === 'function') return icon(props);
        return React.createElement('span', {
          'aria-hidden': 'true',
          'data-dsh-qa-panel-icon': '',
          'data-active': props.active ? 'true' : undefined,
          style: { display: 'inline-flex', width: props.size, height: props.size, alignItems: 'center', justifyContent: 'center' },
          dangerouslySetInnerHTML: { __html: String(icon || '') },
        });
      };
    }

    function createWorkbenchPanel(workbenchUrl, closePanel) {
      return function WorkbenchPanel() {
        var frameRef = React.useRef(null);
        React.useEffect(function () {
          var onMessage = function (event) {
            if (event.origin !== window.location.origin) return;
            if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
            var data = event.data;
            if (data && data.source === 'dsh-qa' && data.type === 'close-panel') closePanel();
          };
          window.addEventListener('message', onMessage);
          return function () { window.removeEventListener('message', onMessage); };
        }, []);

        return React.createElement('div', { style: styles.panel }, [
          React.createElement('div', { key: 'bar', style: styles.bar }, [
            React.createElement('span', { key: 'title', style: styles.title }, '质量工作台 · QA Workbench'),
            React.createElement('span', { key: 'actions', style: styles.actions }, [
              React.createElement('button', {
                key: 'popout',
                type: 'button',
                title: '在标签页打开',
                'aria-label': '在标签页打开',
                style: styles.button,
                onClick: function () { try { window.open(workbenchUrl, '_blank', 'noopener'); } catch (error) { /* ignore */ } },
                dangerouslySetInnerHTML: { __html: POPOUT_ICON },
              }),
              React.createElement('button', {
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
          React.createElement('iframe', {
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

    function apply(ctx) {
      var dispose;
      try {
        dispose = registerDshQaPanel(ctx, createDshQaPanelDefinition());
        ctx.effect(function () { return dispose; }, 'dsh-qa: official Panel slots');
      } catch (error) {
        if (typeof dispose === 'function') dispose();
        reportPanelRegistrationError(error);
      }
    }

    var styles = {
      panel: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--dsw-alias-bg-base, #fff)' },
      bar: { flex: 'none', display: 'flex', alignItems: 'center', gap: 10, height: 42, padding: '0 10px 0 14px', borderBottom: '1px solid var(--dsw-alias-border-l2, #e4e9f2)', background: 'var(--dsw-alias-bg-base, #fff)' },
      title: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #1c2333)' },
      actions: { display: 'flex', gap: 4, alignItems: 'center' },
      button: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: 0, borderRadius: 7, background: 'transparent', color: 'var(--dsw-alias-label-secondary, #5b6478)', cursor: 'pointer' },
      frame: { flex: 1, minHeight: 0, width: '100%', border: 0, background: '#eef3f9' },
    };

    exports.apply = apply;
    exports.inject = inject;
    exports.createDshQaPanelDefinition = createDshQaPanelDefinition;
    exports.registerDshQaPanel = registerDshQaPanel;
    return exports;
  },
});
