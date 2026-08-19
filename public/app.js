// 质量工作台前端：测试首页、DSH 测试模式、项目看板、日历排期
(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const FEED_ICON = { req: '需', tc: '例', defect: '缺', milestone: '里', report: '报', knowledge: '知', minute: '纪', gate: '审', event: '程', member: '人', transition: '转', tool: 'AI', case: '项', run: '跑', chat: '问' };
  const REQ_KIND_CN = { functional: '功能需求', nonfunctional: '非功能需求', risk: '风险点', issue: '问题' };
  const TC_KIND_CN = { functional: '功能', boundary: '边界', interface: '接口', ui: '界面', performance: '性能', security: '安全', compat: '兼容', other: '其他' };
  const MS_KIND_CN = { release: '发布', review: '评审', freeze: '冻结', other: '其他' };
  const EVENT_KIND_CN = { meeting: '会议', release: '发布', review: '评审', other: '其他日程' };
  const REPORT_CN = { 'test-plan': '测试计划', 'test-report': '测试报告', 'defect-report': '缺陷报告', 'release-note': '发布说明', summary: '测试总结' };
  const GATE_CN = { 'testcase-review': '用例评审门禁', release: '发布门禁', closure: '结项门禁' };
  const ROLE_CN = { owner: '负责人', qa: '测试', dev: '开发', pm: '产品', other: '其他' };
  const ROLE_EN = { 负责人: 'owner', 测试: 'qa', 开发: 'dev', 产品: 'pm', 其他: 'other' };
  const TC_STATUS_CN = { draft: '草稿', reviewed: '已评审', executed: '已执行' };
  const SEVERITY_CN = { critical: '致命', major: '严重', minor: '一般', trivial: '轻微' };
  const DEFECT_STATUS_CN = { open: '待处理', fixing: '修复中', verify: '待验证', closed: '已关闭' };
  const TYPE_CN = { web: 'Web 应用', app: '移动 App', api: '接口服务', desktop: '桌面端', embedded: '嵌入式', data: '数据平台', other: '其他' };
  const KIND_CN = { project: '测试项目', iteration: '迭代' };
  const MODE_CN = { full: '全流程辅助', manual: '按需协作' };
  const MODE_DESC = {
    full: '主动提取需求、生成用例、登记缺陷并提示下一步',
    manual: '只有明确要求时才登记或改变项目数据',
  };
  const THEMES = {
    dashboard: { label: '质量仪表', motto: 'QA Workbench · 质量第一' },
    terminal: { label: '终端', motto: 'ALL TESTS PASS' },
    minimal: { label: '极简', motto: 'LESS, BUT SHIPPED' },
    cyber: { label: '赛博', motto: 'QUALITY ASSURANCE // ALL SYSTEMS GO' },
  };
  const DEFAULT_LAYOUT = { rail: 184, cases: 220, context: 260, railCollapsed: false, casesCollapsed: false, contextCollapsed: false };
  const LAYOUT_RANGES = { rail: [150, 280], cases: [180, 360], context: [220, 420] };

  const state = {
    view: 'dashboard', columns: [], cards: new Map(), feed: [], schedule: [], reminders: [], stats: {}, settings: {},
    activeProjectId: null, activeProject: null, drawerProject: null, drawerTab: 'overview',
    streams: new Map(), busy: new Set(), justDragged: false, search: '', caseFilter: 'all',
    dshEmbedded: location.pathname.startsWith('/api/dsh-qa/workbench'),
    theme: 'dashboard',
    layout: { ...DEFAULT_LAYOUT },
    remote: { status: null, url: '', expiresAt: 0 },
    dsh: { projectId: null, sessionId: '', skills: [], commands: [], models: null, qaPreset: null, busy: false, turnToken: 0 },
    calendarCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1), selectedDate: localDate(new Date()),
    refreshTimer: null,
  };

  // ---------- helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function localDate(d) {
    const y = d.getFullYear();
    return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  function fmtDateFull(iso) { return iso ? new Date(iso).toLocaleString('zh-CN', { hour12: false }) : ''; }
  function fmtTime(iso) {
    if (!iso) return '';
    const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 10) return '刚刚';
    if (seconds < 60) return Math.floor(seconds) + '秒前';
    if (seconds < 3600) return Math.floor(seconds / 60) + '分钟前';
    if (seconds < 86400) return Math.floor(seconds / 3600) + '小时前';
    if (seconds < 86400 * 7) return Math.floor(seconds / 86400) + '天前';
    return new Date(iso).toLocaleDateString('zh-CN');
  }
  async function api(path, opts = {}) {
    const response = await fetch(path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
    return data;
  }
  async function dshRpc(method, payload = {}) {
    if (!state.dshEmbedded) throw new Error('请从 DSH 侧边栏打开“质量工作台”后使用原生技能与命令');
    const rpcId = globalThis.crypto?.randomUUID?.() || `dshqa-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const response = await fetch(`/api/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`DSH 连接失败 (${response.status})`);
    if (data.rpcId && data.rpcId !== rpcId) throw new Error('DSH 响应校验失败');
    if (!data.result?.ok) throw new Error(data.result?.error?.message || 'DSH 调用失败');
    return data.result.value;
  }
  async function dshRemote(endpoint, args = {}) {
    if (!state.dshEmbedded) throw new Error('当前不在 DSH 插件环境中');
    const rpcId = globalThis.crypto?.randomUUID?.() || `dshqa-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const response = await fetch(`/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload: { args } }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`DSH 命令接口失败 (${response.status})`);
    if (!data.result?.ok) throw new Error(data.result?.error?.message || 'DSH 命令调用失败');
    return data.result.value;
  }
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min));
  function applyLayout(next = {}, persist = true) {
    state.layout = { ...state.layout, ...next };
    for (const key of ['rail', 'cases', 'context']) {
      const [min, max] = LAYOUT_RANGES[key];
      state.layout[key] = clamp(state.layout[key], min, max);
    }
    document.documentElement.style.setProperty('--rail-w', `${state.layout.railCollapsed ? 64 : state.layout.rail}px`);
    document.documentElement.style.setProperty('--case-sidebar-w', `${state.layout.cases}px`);
    document.documentElement.style.setProperty('--context-w', `${state.layout.context}px`);
    document.body.classList.toggle('rail-collapsed', state.layout.railCollapsed);
    document.body.classList.toggle('cases-collapsed', state.layout.casesCollapsed);
    document.body.classList.toggle('context-collapsed', state.layout.contextCollapsed);
    const controls = [
      ['#rail-resizer', 'rail', state.layout.railCollapsed],
      ['#case-resizer', 'cases', state.layout.casesCollapsed],
      ['#context-resizer', 'context', state.layout.contextCollapsed],
    ];
    for (const [selector, key, collapsed] of controls) {
      const el = $(selector);
      if (!el) continue;
      el.setAttribute('aria-valuenow', collapsed ? '0' : String(state.layout[key]));
      el.setAttribute('aria-valuetext', collapsed ? '已收起' : `${state.layout[key]} 像素`);
    }
    $('#btn-collapse-rail').textContent = state.layout.railCollapsed ? '›' : '‹';
    $('#btn-collapse-rail').title = state.layout.railCollapsed ? '展开主导航' : '收起主导航';
    $('#btn-collapse-cases').textContent = state.layout.casesCollapsed ? '›' : '‹';
    $('#btn-collapse-context').textContent = state.layout.contextCollapsed ? '‹' : '›';
    if (persist) localStorage.setItem('dsh-qa-layout', JSON.stringify(state.layout));
  }
  function loadLayout() {
    try { applyLayout({ ...DEFAULT_LAYOUT, ...JSON.parse(localStorage.getItem('dsh-qa-layout') || '{}') }, false); }
    catch { applyLayout(DEFAULT_LAYOUT, false); }
  }
  function toggleLayoutPane(key) {
    const collapsedKey = `${key}Collapsed`;
    applyLayout({ [collapsedKey]: !state.layout[collapsedKey] });
  }
  function bindSplitter(selector, key, direction = 1) {
    const el = $(selector);
    const [min, max] = LAYOUT_RANGES[key];
    let moved = false;
    el.addEventListener('pointerdown', (event) => {
      if (state.layout[`${key}Collapsed`]) return;
      moved = false;
      const startX = event.clientX;
      const startValue = state.layout[key];
      el.setPointerCapture?.(event.pointerId);
      el.classList.add('active');
      document.body.classList.add('is-resizing');
      const move = (moveEvent) => {
        if (Math.abs(moveEvent.clientX - startX) > 2) moved = true;
        applyLayout({ [key]: clamp(startValue + (moveEvent.clientX - startX) * direction, min, max) }, false);
      };
      const end = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', end);
        document.removeEventListener('pointercancel', end);
        el.classList.remove('active');
        document.body.classList.remove('is-resizing');
        applyLayout({}, true);
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', end);
      document.addEventListener('pointercancel', end);
    });
    el.addEventListener('click', () => { if (!moved && state.layout[`${key}Collapsed`]) toggleLayoutPane(key); });
    el.addEventListener('dblclick', () => applyLayout({ [key]: DEFAULT_LAYOUT[key], [`${key}Collapsed`]: false }));
    el.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') return applyLayout({ [key]: DEFAULT_LAYOUT[key], [`${key}Collapsed`]: false });
      const delta = (event.key === 'ArrowRight' ? 10 : -10) * direction;
      applyLayout({ [key]: clamp(state.layout[key] + delta, min, max), [`${key}Collapsed`]: false });
    });
  }
  function toast(message, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = message;
    $('#toast-root').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
  function sortedCards() {
    return [...state.cards.values()].sort((a, b) => (b.lastActivityAt || '').localeCompare(a.lastActivityAt || ''));
  }
  function columnOf(card) { return state.columns.find((column) => column.id === card?.status); }
  function activeCard() { return state.cards.get(state.activeProjectId); }
  function scheduleRefresh() {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(() => refreshBoard(false), 180);
  }
  function emptyHtml(text) { return `<div class="empty-tip">${esc(text)}</div>`; }
  const tinyIcon = (kind) => kind === 'milestone'
    ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 3h6"/></svg>'
    : kind === 'gate'
      ? '<svg viewBox="0 0 24 24"><path d="M12 3 4 7v5c0 5 3.4 8 8 9 4.6-1 8-4 8-9V7l-8-4Z"/><path d="m9 12 2 2 4-4"/></svg>'
      : kind === 'workflow'
        ? '<svg viewBox="0 0 24 24"><path d="M5 5h14M5 12h14M5 19h14"/><path d="m3 5 .5.5L4.5 4M3 12l.5.5 1-1.5M3 19l.5.5 1-1.5"/></svg>'
        : '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>';

  // ---------- navigation ----------
  function switchView(view) {
    if (!['dashboard', 'assistant', 'board', 'calendar'].includes(view)) return;
    state.view = view;
    $$('.view').forEach((el) => el.classList.toggle('active', el.id === `view-${view}`));
    $$('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.view === view));
    if (view === 'dashboard') renderDashboard();
    if (view === 'board') renderBoard();
    if (view === 'calendar') renderCalendars();
  }
  async function openProject(id) {
    switchView('assistant');
    await loadChat(id, false);
  }

  // ---------- dashboard ----------
  function renderMetrics() {
    const s = state.stats || {};
    const metrics = [
      ['在办项目', s.activeProjects ?? 0, `共 ${s.totalProjects ?? 0} 个`, 'blue', '<svg viewBox="0 0 24 24"><path d="M4 7h6l2 2h8v10H4z"/><path d="M4 7V5h6l2 2"/></svg>'],
      ['七日内里程碑', s.dueSoonMilestones ?? 0, '需要提前准备', 'amber', '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 3h6"/></svg>'],
      ['已逾期', s.overdueMilestones ?? 0, s.overdueMilestones ? '请立即核查' : '目前无逾期', 'red', '<svg viewBox="0 0 24 24"><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17h.01"/></svg>'],
      ['未关闭缺陷', s.openDefects ?? 0, '按严重级别优先处理', 'teal', '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/></svg>'],
    ];
    $('#metric-cards').innerHTML = metrics.map(([label, value, note, color, icon]) => `
      <div class="metric-card"><div class="metric-copy"><small>${label}</small><strong>${value}</strong><em>${note}</em></div><span class="metric-icon ${color}">${icon}</span></div>`).join('');
  }
  function reminderTime(item) {
    if (item.type === 'gate') return '待审批';
    if (item.type === 'workflow') return '建议处理';
    if (item.days < 0) return `逾期 ${-item.days} 天`;
    if (item.days === 0) return '今天到期';
    if (item.days === 1) return '明天到期';
    return `${item.days} 天后`;
  }
  function renderReminders() {
    const list = $('#dashboard-reminders');
    const items = state.reminders.filter((item) => item.type !== 'milestone' || item.days <= 14).slice(0, 5);
    list.innerHTML = items.length ? items.map((item) => `
      <div class="attention-item ${item.severity}" data-project-id="${item.projectId}">
        <span class="attention-mark">${tinyIcon(item.type)}</span>
        <div><div class="attention-title">${esc(item.title)}</div><div class="attention-meta">${esc(item.projectTitle)}${item.date ? ` · ${esc(item.date)}` : ''}</div></div>
        <span class="attention-time">${reminderTime(item)}</span>
      </div>`).join('') : emptyHtml('今天没有临期事项，可以专注推进在办项目。');
    $$('.attention-item', list).forEach((el) => el.addEventListener('click', () => openProject(el.dataset.projectId)));
    const alertCount = state.reminders.filter((x) => x.severity !== 'normal').length;
    $('#nav-alert-count').textContent = alertCount;
    $('#nav-alert-count').classList.toggle('hidden', !alertCount);
  }
  function renderDashboardCases() {
    const cards = sortedCards().filter((card) => card.status !== 'closed').slice(0, 6);
    $('#dashboard-cases').innerHTML = cards.length ? cards.map((card) => {
      const column = columnOf(card);
      const risk = card.counts.milestoneOverdue
        ? `<span class="risk-badge alert">逾期 ${card.counts.milestoneOverdue}</span>`
        : card.counts.milestoneSoon
          ? `<span class="risk-badge">临期 ${card.counts.milestoneSoon}</span>`
          : '<span class="risk-badge">无里程碑风险</span>';
      return `<div class="case-overview-row" data-project-id="${card.id}">
        <div class="case-main"><b>${esc(card.title)}</b><span>${esc(card.projectKey || card.typeLabel || '未编号')}</span></div>
        <span class="stage-pill" style="--cc:${column?.color || '#64748b'}">${esc(column?.title || card.status)}</span>
        <span class="risk-badges">${risk}<span class="risk-badge">用例 ${card.counts.testcases}</span></span>
        <span class="last-active">${fmtTime(card.lastActivityAt)}</span>
      </div>`;
    }).join('') : emptyHtml('还没有测试项目，先创建一个开始。');
    $$('.case-overview-row', $('#dashboard-cases')).forEach((el) => el.addEventListener('click', () => openProject(el.dataset.projectId)));
  }
  function renderAiSummary() {
    const cards = sortedCards();
    const enabled = cards.filter((card) => card.assistant?.enabled !== false).length;
    const full = cards.filter((card) => card.assistant?.enabled !== false && card.assistant?.mode === 'full').length;
    const off = cards.length - enabled;
    $('#ai-control-summary').innerHTML = `
      <div class="control-row"><i></i><span>已启用 DSH 辅助</span><b>${enabled} 个项目</b></div>
      <div class="control-row"><i></i><span>全流程主动协作</span><b>${full} 个项目</b></div>
      <div class="control-row"><i class="off"></i><span>关闭自动辅助</span><b>${off} 个项目</b></div>`;
    const model = state.dsh.models?.current?.model;
    $('#dashboard-model-note').textContent = state.dshEmbedded
      ? `对话统一使用 DSH 测试模式${model ? ` · 当前模型 ${model}` : ''}，模型与权限均跟随 DSH。`
      : '项目管理可独立使用；对话、模型、技能与命令请从 DSH 侧边栏进入。';
  }
  function renderDashboardFeed() {
    $('#dashboard-feed').innerHTML = state.feed.slice(0, 6).map((entry) => `
      <div class="activity-item"><span class="activity-icon">${FEED_ICON[entry.type] || '记'}</span><div class="activity-copy"><b>${esc(entry.label)}</b><span>${esc(entry.projectTitle || '工作台')}</span></div><span class="activity-time">${fmtTime(entry.ts)}</span></div>`).join('') || emptyHtml('暂无工作台动态');
  }
  function renderDashboard() {
    const now = new Date();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    $('#today-label').textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · 星期${weekdays[now.getDay()]}`;
    $('.welcome-row h1').textContent = `${now.getHours() < 12 ? '上午' : now.getHours() < 18 ? '下午' : '晚上'}好，今天从哪里开始？`;
    renderMetrics();
    renderReminders();
    renderDashboardCases();
    renderAiSummary();
    renderDashboardFeed();
    renderCalendars();
  }

  // ---------- calendars ----------
  function monthCells(cursor) {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(1 - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }
  function itemsOn(date) { return state.schedule.filter((item) => item.date === date); }
  function renderMiniCalendar() {
    const cursor = state.calendarCursor;
    $('#calendar-caption').textContent = `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`;
    const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
    const cells = monthCells(cursor);
    $('#mini-calendar').innerHTML = weekdays.map((day) => `<span class="weekday">${day}</span>`).join('') + cells.map((date) => {
      const iso = localDate(date);
      const classes = ['mini-day'];
      if (date.getMonth() !== cursor.getMonth()) classes.push('out');
      if (iso === localDate(new Date())) classes.push('today');
      if (iso === state.selectedDate) classes.push('selected');
      if (itemsOn(iso).length) classes.push('has-event');
      return `<button class="${classes.join(' ')}" data-date="${iso}" type="button">${date.getDate()}</button>`;
    }).join('');
    $$('.mini-day', $('#mini-calendar')).forEach((button) => button.addEventListener('click', () => { state.selectedDate = button.dataset.date; renderMiniCalendar(); }));
    const selected = itemsOn(state.selectedDate);
    $('#mini-agenda').innerHTML = (selected.length ? selected.slice(0, 2).map((item) => `
      <div class="mini-agenda-item" data-project-id="${item.projectId}"><i style="background:${item.type === 'milestone' ? 'var(--amber)' : 'var(--blue)'}"></i><div><b>${esc(item.title)}</b><span>${esc(item.projectTitle)}</span></div></div>`).join('') : `<div class="mini-agenda-item"><i style="background:#cbd3d9"></i><div><b>${fmtDate(state.selectedDate)}暂无安排</b><span>可以直接在这一天新建日程</span></div></div>`) + `<button class="mini-agenda-add" type="button">＋ 添加日程</button>`;
    $$('.mini-agenda-item[data-project-id]', $('#mini-agenda')).forEach((el) => el.addEventListener('click', () => openProject(el.dataset.projectId)));
    $('.mini-agenda-add', $('#mini-agenda')).addEventListener('click', () => openScheduleModal(state.selectedDate));
  }
  function renderFullCalendar() {
    const cursor = state.calendarCursor;
    const cells = monthCells(cursor);
    const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const currentYear = cursor.getFullYear();
    $('#cal-year').innerHTML = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i).map((year) => `<option value="${year}" ${year === currentYear ? 'selected' : ''}>${year}</option>`).join('');
    $('#cal-month').innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i}" ${i === cursor.getMonth() ? 'selected' : ''}>${i + 1}</option>`).join('');
    $('#cal-date-jump').value = state.selectedDate;
    $('#full-calendar').innerHTML = weekdays.map((day) => `<div class="weekday">${day}</div>`).join('') + cells.map((date) => {
      const iso = localDate(date);
      const classes = ['full-day'];
      if (date.getMonth() !== cursor.getMonth()) classes.push('out');
      if (iso === localDate(new Date())) classes.push('today');
      if (iso === state.selectedDate) classes.push('selected');
      const events = itemsOn(iso).slice(0, 3).map((item) => {
        const danger = item.type === 'milestone' && item.state?.overdue && !item.done;
        return `<button class="day-event ${item.type === 'milestone' ? 'deadline' : ''} ${danger ? 'danger' : ''}" data-project-id="${item.projectId}" type="button" title="${esc(item.projectTitle)} · ${esc(item.title)}">${esc(item.title)}</button>`;
      }).join('');
      const more = itemsOn(iso).length > 3 ? `<span class="day-more">另有 ${itemsOn(iso).length - 3} 项</span>` : '';
      return `<div class="${classes.join(' ')}" data-date="${iso}"><div class="day-top"><span class="day-number">${date.getDate()}</span><button class="day-add" type="button" title="在 ${iso} 新增日程">＋</button></div><div class="day-events">${events}${more}</div></div>`;
    }).join('');
    $$('.full-day', $('#full-calendar')).forEach((el) => el.addEventListener('click', () => selectCalendarDate(el.dataset.date)));
    $$('.day-add', $('#full-calendar')).forEach((el) => el.addEventListener('click', (event) => { event.stopPropagation(); openScheduleModal(el.closest('.full-day').dataset.date); }));
    $$('.day-event', $('#full-calendar')).forEach((el) => el.addEventListener('click', (event) => { event.stopPropagation(); openProject(el.dataset.projectId); }));
    renderSelectedAgenda();
    const today = localDate(new Date());
    const until = new Date(); until.setDate(until.getDate() + 30);
    const upcoming = state.schedule.filter((item) => item.date >= today && item.date <= localDate(until) && !item.done).slice(0, 10);
    $('#calendar-agenda').innerHTML = upcoming.map((item) => `
      <div class="agenda-card" data-project-id="${item.projectId}"><span class="agenda-date">${fmtDate(item.date)} · ${item.type === 'milestone' ? '里程碑' : '日程'}</span><b>${esc(item.title)}</b><span>${esc(item.projectTitle)}</span></div>`).join('') || emptyHtml('暂无近期安排');
    $$('.agenda-card', $('#calendar-agenda')).forEach((el) => el.addEventListener('click', () => openProject(el.dataset.projectId)));
  }
  function selectCalendarDate(iso) {
    state.selectedDate = iso;
    const date = new Date(iso + 'T00:00:00');
    if (date.getMonth() !== state.calendarCursor.getMonth() || date.getFullYear() !== state.calendarCursor.getFullYear()) state.calendarCursor = new Date(date.getFullYear(), date.getMonth(), 1);
    renderCalendars();
  }
  function renderSelectedAgenda() {
    const selectedDate = new Date(state.selectedDate + 'T00:00:00');
    const weekday = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][selectedDate.getDay()];
    $('#selected-date-weekday').textContent = weekday;
    $('#selected-date-label').textContent = `${selectedDate.getFullYear()}年${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日`;
    const selected = itemsOn(state.selectedDate);
    $('#calendar-selected').innerHTML = selected.length ? selected.map((item) => `
      <div class="agenda-card selected-card" data-project-id="${item.projectId}">
        <span class="agenda-type ${item.type}">${item.type === 'milestone' ? '里程碑' : EVENT_KIND_CN[item.kind] || '日程'}</span>
        <b>${esc(item.title)}</b><span>${esc(item.projectTitle)}</span>
        ${item.note || item.basis ? `<p>${esc(item.note || item.basis)}</p>` : ''}
        <button class="agenda-remove" data-entry-id="${item.id}" data-project-id="${item.projectId}" type="button">删除</button>
      </div>`).join('') : `<div class="selected-empty"><span>这一天还没有安排</span><button class="text-btn" id="empty-add-schedule" type="button">立即添加</button></div>`;
    $$('.selected-card', $('#calendar-selected')).forEach((el) => el.addEventListener('click', () => openProject(el.dataset.projectId)));
    $$('.agenda-remove', $('#calendar-selected')).forEach((button) => button.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!confirm('确定删除这项日程或里程碑？')) return;
      try { await api(`api/projects/${button.dataset.projectId}/schedule/${button.dataset.entryId}`, { method: 'DELETE' }); await refreshBoard(false); toast('日程已删除', 'ok'); } catch (error) { toast(error.message, 'err'); }
    }));
    $('#empty-add-schedule', $('#calendar-selected'))?.addEventListener('click', () => openScheduleModal(state.selectedDate));
  }
  function renderCalendars() { renderMiniCalendar(); renderFullCalendar(); }
  function moveMonth(delta) {
    state.calendarCursor = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth() + delta, 1);
    renderCalendars();
  }
  function goToday() {
    const now = new Date();
    state.calendarCursor = new Date(now.getFullYear(), now.getMonth(), 1);
    state.selectedDate = localDate(now);
    renderCalendars();
  }

  // ---------- recent and project lists ----------
  function renderRailCases() {
    $('#rail-case-list').innerHTML = sortedCards().slice(0, 7).map((card) => {
      const column = columnOf(card);
      return `<button class="rail-case ${card.id === state.activeProjectId ? 'active' : ''}" data-project-id="${card.id}" type="button"><b>${esc(card.title)}</b><span><i style="background:${column?.color || '#64748b'}"></i>${esc(KIND_CN[card.kind] || column?.title || card.typeLabel)}</span></button>`;
    }).join('') || emptyHtml('暂无项目');
    $$('.rail-case', $('#rail-case-list')).forEach((button) => button.addEventListener('click', () => openProject(button.dataset.projectId)));
  }
  function renderCaseList() {
    const q = state.search.trim().toLowerCase();
    const cards = sortedCards().filter((card) => {
      const matchesMode = state.caseFilter === 'all' || card.kind === state.caseFilter;
      const haystack = `${card.title} ${card.projectKey || ''} ${(card.members || []).map((member) => member.name).join(' ')}`.toLowerCase();
      return matchesMode && (!q || haystack.includes(q));
    });
    $('#case-total-label').textContent = `${state.cards.size} 个工作空间`;
    $('#case-list').innerHTML = cards.map((card) => {
      const column = columnOf(card);
      return `<button class="case-item ${card.id === state.activeProjectId ? 'active' : ''}" data-project-id="${card.id}" type="button">
        <i class="ci-dot" style="background:${column?.color || '#64748b'}"></i><span class="ci-body"><span class="ci-title">${esc(card.title)}</span><span class="ci-meta"><span>${esc(KIND_CN[card.kind] || card.typeLabel)}</span><span>${esc(column?.title || card.status)}</span><span>${fmtTime(card.lastActivityAt)}</span>${card.aiActive ? '<span class="ci-ai">AI 处理中</span>' : ''}</span></span>
      </button>`;
    }).join('') || emptyHtml(q ? '没有匹配的项目' : '还没有测试项目');
    $$('.case-item', $('#case-list')).forEach((button) => button.addEventListener('click', () => loadChat(button.dataset.projectId, false)));
  }

  // ---------- kanban ----------
  function renderBoard() {
    const board = $('#board');
    board.innerHTML = state.columns.map((column) => `
      <section class="col" data-col="${column.id}" style="--cc:${column.color}"><div class="col-head"><i class="col-dot"></i><div class="col-head-copy">${esc(column.title)}<small>${esc(column.titleEn || column.hint || '')}</small></div><span class="col-count">0</span></div><div class="col-cards"></div></section>`).join('');
    state.cards.forEach((card) => appendCardEl(card));
    updateColCounts();
    bindDnD();
  }
  function cardHtml(card) {
    const counts = card.counts;
    const mats = (card.latestMaterials || []).slice(0, 2).map((m) => `<div class="card-mat">${FEED_ICON[m.type] || '记'} · ${esc(m.label)}</div>`).join('');
    return `<div class="card-top"><div class="card-title">${esc(card.title)}</div>${card.aiActive ? '<span class="ai-chip">AI</span>' : ''}</div>
      <div class="card-meta">${esc(card.projectKey || '未编号')} · ${esc(KIND_CN[card.kind] || card.typeLabel)}</div>
      <div class="card-badges"><span class="badge">需 ${counts.requirements}</span><span class="badge ${counts.milestoneOverdue ? 'danger' : counts.milestoneSoon ? 'warn' : ''}">里 ${counts.milestones}</span><span class="badge">例 ${counts.testcases}</span><span class="badge ${counts.defectsOpen ? 'danger' : ''}">缺 ${counts.defects}</span><span class="badge doc">报 ${counts.reports}</span>${counts.pendingGates ? `<span class="badge gate">审 ${counts.pendingGates}</span>` : ''}</div>${mats ? `<div class="card-mats">${mats}</div>` : ''}<div class="card-foot">${fmtTime(card.lastActivityAt)}</div>`;
  }
  function makeCardEl(card) {
    const el = document.createElement('article');
    el.className = 'card';
    el.dataset.id = card.id;
    el.draggable = true;
    el.style.setProperty('--cc', columnOf(card)?.color || '#64748b');
    el.innerHTML = cardHtml(card);
    el.addEventListener('dragstart', (event) => { state.justDragged = true; el.classList.add('dragging'); event.dataTransfer.setData('text/projectid', card.id); setTimeout(() => { state.justDragged = false; }, 300); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('click', () => { if (!state.justDragged) openProject(card.id); });
    return el;
  }
  function appendCardEl(card) {
    const column = $(`.col[data-col="${card.status}"]`);
    if (!column) return;
    const container = $('.col-cards', column);
    const old = $(`.card[data-id="${card.id}"]`, container);
    const next = makeCardEl(card);
    if (old) old.replaceWith(next); else container.appendChild(next);
    $$('.empty-col', container).forEach((el) => el.remove());
  }
  function updateColCounts() {
    state.columns.forEach((column) => {
      const container = $(`.col[data-col="${column.id}"] .col-cards`);
      const count = [...state.cards.values()].filter((card) => card.status === column.id).length;
      const label = $(`.col[data-col="${column.id}"] .col-count`);
      if (label) label.textContent = count;
      if (container && !count) container.innerHTML = '<div class="empty-col">暂无项目</div>';
    });
  }
  function bindDnD() {
    $$('.col').forEach((column) => {
      column.addEventListener('dragover', (event) => { event.preventDefault(); column.classList.add('drag-over'); });
      column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
      column.addEventListener('drop', async (event) => {
        event.preventDefault(); column.classList.remove('drag-over');
        const projectId = event.dataTransfer.getData('text/projectid');
        const card = state.cards.get(projectId);
        if (!card || card.status === column.dataset.col) return;
        try { await api(`api/projects/${projectId}/transition`, { method: 'POST', body: { to: column.dataset.col } }); }
        catch (error) { toast(error.message, 'err'); }
      });
    });
  }

  // ---------- chat ----------
  async function loadChat(id, switchToAssistant = true) {
    if (switchToAssistant) switchView('assistant');
    state.dsh.turnToken += 1;
    state.activeProjectId = id;
    state.streams.clear();
    renderRailCases();
    renderCaseList();
    try {
      const data = await api(`api/projects/${id}`);
      state.activeProject = data.project;
      updateChatHead(data.project);
      renderProjectRadar(data.project);
      renderFeed();
      await initializeDshChat({ initialize: state.view === 'assistant' });
    } catch (error) { toast(error.message, 'err'); }
  }
  function updateChatHead(p) {
    const column = columnOf(p);
    $('#chat-head-title').textContent = p?.title || '选择一个项目开始';
    $('#chat-head-meta').innerHTML = p ? `<span>${esc(p.projectKey || '未编号')}</span><span class="status-pill" style="background:${column?.color || '#64748b'}">${esc(column?.title || p.status)}</span>${p.product ? `<span>${esc(p.product)}</span>` : ''}` : '';
    const policy = p?.assistant || { enabled: true, mode: 'full' };
    $('#assistant-mode-label').textContent = policy.enabled === false ? '自动辅助已关闭' : MODE_CN[policy.mode] || '全流程辅助';
  }
  function dshModelValue(provider, model) { return `${encodeURIComponent(provider)}::${encodeURIComponent(model)}`; }
  function parseDshModelValue(value) {
    const [provider, model] = String(value).split('::');
    return provider && model ? { provider: decodeURIComponent(provider), model: decodeURIComponent(model) } : null;
  }
  function populateDshModelSelect(models) {
    const select = $('#chat-model');
    if (!models) { select.innerHTML = '<option>正在读取 DSH 模型…</option>'; select.disabled = true; return; }
    const currentValue = dshModelValue(models.current.provider, models.current.model);
    let hasCurrent = false;
    select.innerHTML = models.groups.map((group) => `<optgroup label="${esc(group.name || group.id)}">${(group.models || []).map((model) => {
      const value = dshModelValue(group.id, model.id); if (value === currentValue) hasCurrent = true;
      return `<option value="${esc(value)}">${esc(model.name || model.id)}</option>`;
    }).join('')}</optgroup>`).join('');
    if (!hasCurrent) select.insertAdjacentHTML('afterbegin', `<option value="${esc(currentValue)}">${esc(models.current.model)} · 当前</option>`);
    select.value = currentValue;
    select.disabled = !models.routable && !models.groups.length;
    $('#model-switch').title = `DSH 原生会话模型 · ${models.current.provider}`;
  }
  function updateDshChrome() {
    const presetName = state.dsh.qaPreset?.name || '测试模式';
    $('#btn-dsh-capabilities').classList.toggle('hidden', !state.dshEmbedded);
    $('#capability-count').textContent = state.dsh.sessionId ? `${state.dsh.skills.length} / ${state.dsh.commands.length}` : '';
    $('#service-status').classList.toggle('offline', !state.dshEmbedded);
    $('#service-status span').textContent = state.dshEmbedded ? `DSH · ${presetName}` : '请从 DSH 打开';
    if (!state.dshEmbedded) $('#channel-note').textContent = '当前是独立项目管理模式；对话、模型、技能与命令请从 DSH 侧边栏进入';
    else if (!state.dsh.sessionId) $('#channel-note').textContent = `DSH ${presetName} · 首次进入项目时自动绑定文件夹与会话`;
    else {
      const model = state.dsh.models?.current?.model;
      $('#channel-note').textContent = `DSH ${presetName}${model ? ` · ${model}` : ''} · ${state.dsh.skills.length} 个技能 · ${state.dsh.commands.length} 个命令`;
    }
    renderAiSummary();
  }
  async function getQaPreset() {
    if (state.dsh.qaPreset) return state.dsh.qaPreset;
    const catalog = await dshRpc('agentPreset.list', {});
    const presets = catalog.presets || [];
    const preset = presets.find((item) => item.id === 'qa')
      || presets.find((item) => /测试|质量|qa|quality|test/i.test(`${item.id} ${item.name} ${item.description || ''}`));
    if (!preset) throw new Error('DSH 中未找到测试模式 preset，请先安装或启用 dsh-qa');
    state.dsh.qaPreset = preset;
    updateDshChrome();
    return preset;
  }
  async function initializeDshChat(options = {}) {
    const { initialize = true } = options;
    updateDshChrome();
    populateDshModelSelect(state.dsh.projectId === state.activeProject?.id ? state.dsh.models : null);
    renderDshEmpty(initialize ? '正在连接本项目的 DSH 测试模式会话…' : '进入对话空间后即可使用 DSH 模型、技能、命令和工具。');
    updateChatUI();
    if (!initialize || !state.activeProject) return;
    await ensureDshProject(state.activeProject);
    if (state.activeProjectId === state.dsh.projectId) await renderDshHistory();
  }
  async function ensureDshProject(p = state.activeProject) {
    if (!p) throw new Error('请先选择项目');
    if (!state.dshEmbedded) throw new Error('请从 DSH 侧边栏打开“质量工作台”');
    if (state.dsh.projectId === p.id && state.dsh.sessionId && state.dsh.models) return state.dsh.sessionId;
    const projectId = p.id;
    const qaPreset = await getQaPreset();
    state.dsh = { projectId, sessionId: '', skills: [], commands: [], models: null, qaPreset, busy: false, turnToken: state.dsh.turnToken };
    updateDshChrome();
    if (!p.workspacePath) {
      const workspace = await api(`api/projects/${projectId}/workspace`, { method: 'POST', body: {} });
      p.workspacePath = workspace.path;
    }
    let sessionId = p.dshSessionId || '';
    let models;
    let needsNewSession = !sessionId;
    if (sessionId) {
      try {
        const sessions = await dshRpc('session.list', {});
        const linked = (sessions.items || []).find((item) => item.sessionId === sessionId);
        models = await dshRpc('session.models', { sessionId });
        if (linked?.agentPreset !== qaPreset.id) {
          if (linked?.blank !== false) {
            await dshRpc('agentPreset.select', { sessionId, agentPreset: qaPreset.id });
            models = await dshRpc('session.models', { sessionId });
            toast(`本项目已切换为 DSH ${qaPreset.name}`, 'ok');
          } else {
            needsNewSession = true;
          }
        }
      } catch { needsNewSession = true; }
    }
    if (needsNewSession) {
      const created = await dshRpc('session.create', { cwd: p.workspacePath, agentPreset: qaPreset.id });
      sessionId = created.sessionId;
      await dshRpc('session.rename', { sessionId, title: `质量｜${p.title}` }).catch(() => {});
      await api(`api/projects/${projectId}`, { method: 'PATCH', body: { dshSessionId: sessionId } });
      p.dshSessionId = sessionId;
      models = await dshRpc('session.models', { sessionId });
    }
    const [skillResult, commandResult] = await Promise.allSettled([
      dshRpc('skill.list', { sessionId }),
      dshRemote('commands/list', { agentId: sessionId }),
    ]);
    if (state.activeProjectId !== projectId) return sessionId;
    state.dsh.projectId = projectId;
    state.dsh.sessionId = sessionId;
    state.dsh.models = models;
    state.dsh.skills = skillResult.status === 'fulfilled' ? skillResult.value.skills || [] : [];
    state.dsh.commands = commandResult.status === 'fulfilled' ? commandResult.value || [] : [];
    populateDshModelSelect(models);
    updateDshChrome();
    return sessionId;
  }
  function renderMessages(messages) {
    const container = $('#chat-msgs');
    if (!messages.length) {
      container.innerHTML = `<div class="chat-empty"><span class="ai-orb">AI</span><h3>从需求开始，我会按你的策略协作</h3><p>可用于需求梳理、用例设计、缺陷登记、里程碑跟踪和测试报告起草。所有关键动作都保留负责人确认。</p><div class="prompt-grid"><button class="prompt-chip" type="button">帮我梳理这份需求并设计测试用例</button><button class="prompt-chip" type="button">根据当前用例检查覆盖缺口</button><button class="prompt-chip" type="button">分析本项目缺陷并给出根因建议</button><button class="prompt-chip" type="button">整理下一步测试任务</button></div></div>`;
      $$('.prompt-chip', container).forEach((button) => button.addEventListener('click', () => { $('#chat-input').value = button.textContent; $('#chat-input').focus(); autoGrow($('#chat-input')); }));
      return;
    }
    container.innerHTML = '';
    messages.forEach((message) => {
      if (message.role === 'user') appendUserMsg(message.content, false);
      else if (message.role === 'assistant') appendAiMsg(message.content, false);
    });
    container.scrollTop = container.scrollHeight;
  }
  function appendUserMsg(text, scroll = true) {
    const wrap = document.createElement('div');
    wrap.className = 'msg-wrap user'; wrap.innerHTML = `<div class="msg user">${esc(text)}</div>`;
    $('#chat-msgs').appendChild(wrap); if (scroll) scrollChat();
  }
  function appendAiMsg(text, scroll = true, kind = '') {
    const wrap = document.createElement('div');
    wrap.className = 'msg-wrap ai'; wrap.innerHTML = `<div class="msg ai ${esc(kind)}">${esc(text)}</div>`;
    $('#chat-msgs').appendChild(wrap); if (scroll) scrollChat();
    return $('.msg', wrap);
  }
  function appendToolMsg(label) {
    const wrap = document.createElement('div');
    wrap.className = 'msg-wrap ai'; wrap.innerHTML = `<div class="msg toolbox">AI 正在执行：${esc(label)}</div>`;
    $('#chat-msgs').appendChild(wrap); scrollChat();
  }
  function scrollChat() { const el = $('#chat-msgs'); el.scrollTop = el.scrollHeight; }
  function renderDshEmpty(message) {
    $('#chat-msgs').innerHTML = `<div class="chat-empty"><span class="ai-orb">DSH</span><h3>DSH 测试模式</h3><p>${esc(message)}</p><div class="prompt-grid"><button class="prompt-chip dsh-prompt" type="button">/qa-testcase-generator 为需求生成测试用例</button><button class="prompt-chip dsh-prompt" type="button">/qa-defect-analysis 分析缺陷并给根因建议</button><button class="prompt-chip dsh-prompt" type="button">梳理本项目测试范围并列出下一步</button><button class="prompt-chip dsh-prompt" type="button">/plan 为本项目制定测试执行计划</button></div></div>`;
    $$('.dsh-prompt', $('#chat-msgs')).forEach((button) => button.addEventListener('click', () => { $('#chat-input').value = button.textContent; $('#chat-input').focus(); autoGrow($('#chat-input')); renderSlashSuggestions(); }));
  }
  function contentText(content) { return (Array.isArray(content) ? content : []).filter((block) => block?.type === 'text').map((block) => block.text || '').join('\n').trim(); }
  function dshRows(events) {
    const rows = [];
    const commands = new Map();
    for (const entry of [...events].sort((a, b) => a.event.seq - b.event.seq)) {
      const event = entry.event;
      if (event.type === 'user/message') {
        const message = event.data?.message;
        if (message?.source?.kind !== 'user') continue;
        const text = contentText(message.content);
        if (text) rows.push({ role: 'user', text });
      } else if (event.type === 'assistant/message') {
        const text = contentText(event.data?.message?.content);
        if (text) rows.push({ role: 'assistant', text, kind: 'dsh' });
      } else if (event.type === 'command/run') {
        const data = event.data || {};
        commands.set(data.commandId, data);
        rows.push({ role: 'user', text: `/${data.name || 'command'}${data.args ? ` ${data.args}` : ''}` });
      } else if (event.type === 'command/done') {
        const data = event.data || {};
        const started = commands.get(data.commandId);
        rows.push({ role: 'assistant', kind: 'command', text: data.text || (data.kind === 'error' ? '命令执行失败' : `/${started?.name || 'command'} 已执行`) });
        commands.delete(data.commandId);
      }
    }
    for (const command of commands.values()) rows.push({ role: 'assistant', kind: 'command', text: `/${command.name} 正在执行…` });
    return rows;
  }
  async function renderDshHistory() {
    if (!state.dsh.sessionId) return renderDshEmpty('尚未绑定 DSH 会话。');
    const history = await dshRpc('session.history', { sessionId: state.dsh.sessionId, maxMessages: 30 });
    const rows = dshRows(history.events || []);
    if (!rows.length) return renderDshEmpty(`已绑定本项目文件夹。输入“/”可选择 ${state.dsh.skills.length} 个技能或 ${state.dsh.commands.length} 个命令。`);
    $('#chat-msgs').innerHTML = '';
    rows.forEach((row) => row.role === 'user' ? appendUserMsg(row.text, false) : appendAiMsg(row.text, false, row.kind));
    scrollChat();
  }
  async function sendMessage() {
    const input = $('#chat-input');
    const text = input.value.trim();
    if (!text || !state.activeProjectId || state.dsh.busy) return;
    return sendDshMessage(text);
  }
  async function sendDshMessage(text) {
    const projectId = state.activeProjectId;
    const input = $('#chat-input');
    let token = 0;
    input.value = ''; autoGrow(input); renderSlashSuggestions();
    try {
      const sessionId = await ensureDshProject();
      if (projectId !== state.activeProjectId) return;
      appendUserMsg(text);
      state.dsh.busy = true;
      token = ++state.dsh.turnToken;
      updateChatUI();
      const commandName = text.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s|$)/i)?.[1]?.toLowerCase();
      const command = commandName && state.dsh.commands.find((item) => item.name === commandName);
      if (command) {
        const pending = appendAiMsg(`/${command.name} 正在执行…`, true, 'command');
        const execution = await dshRemote('commands/execute', { agentId: sessionId, line: text });
        const result = execution?.result;
        pending.textContent = result?.text || (result?.kind === 'error' ? '命令执行失败' : `/${command.name} 已执行`);
        if (result?.kind === 'error') throw new Error(result.text || '命令执行失败');
        toast(`DSH 命令 /${command.name} 已执行`, 'ok');
      } else {
        const before = await dshRpc('session.history', { sessionId, maxMessages: 1 });
        const afterSeq = Math.max(-1, ...(before.events || []).map((entry) => entry.event.seq));
        const pending = appendAiMsg('DSH 测试模式正在读取技能与项目文件…', true, 'dsh');
        await dshRpc('session.prompt', { sessionId, mode: 'queue', content: [{ type: 'text', text }], clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
        const answer = await waitForDshTurn(sessionId, afterSeq, pending, token);
        if (token === state.dsh.turnToken && projectId === state.activeProjectId) pending.textContent = answer || '本轮已完成（无文本回复）';
      }
    } catch (error) {
      if (token && token !== state.dsh.turnToken) return;
      if (projectId === state.activeProjectId) appendAiMsg(`DSH 调用失败：${error.message}`, true, 'dsh');
      toast(error.message, 'err');
    } finally {
      if (projectId === state.activeProjectId) { state.dsh.busy = false; updateChatUI(); }
    }
  }
  async function waitForDshTurn(sessionId, afterSeq, pending, token) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 30 * 60 * 1000) {
      if (token !== state.dsh.turnToken) throw new Error('已切换项目或对话通道，DSH 会话仍会在后台继续');
      await new Promise((resolve) => setTimeout(resolve, 900));
      const history = await dshRpc('session.history', { sessionId, maxMessages: 6 });
      const fresh = (history.events || []).filter((entry) => entry.event.seq > afterSeq);
      const tools = fresh.filter((entry) => entry.event.type === 'tool/call');
      if (tools.length) {
        const last = tools.at(-1);
        const toolName = last.view?.view?.title || last.event.data?.name || last.event.data?.call?.name || '工具';
        pending.textContent = `DSH 测试模式正在执行：${toolName}（如需授权，请留意 DSH 主界面）`;
      }
      const assistant = [...fresh].reverse().find((entry) => entry.event.type === 'assistant/message');
      const ended = fresh.some((entry) => entry.event.type === 'turn/end');
      if (ended) return contentText(assistant?.event?.data?.message?.content);
    }
    throw new Error('DSH 任务仍在运行，可稍后重新打开本项目查看结果');
  }
  async function stopChat() {
    if (!state.activeProjectId) return;
    try {
      if (state.dsh.sessionId) await dshRpc('session.cancel', { sessionId: state.dsh.sessionId });
      state.dsh.turnToken += 1; state.dsh.busy = false; updateChatUI(); toast('已请求停止 DSH 当前任务', 'ok');
    }
    catch (error) { toast(error.message, 'err'); }
  }
  function autoGrow(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 130) + 'px'; }
  function updateChatUI() {
    const busy = state.dsh.busy;
    $('#chat-input').disabled = !state.activeProjectId || busy;
    $('#chat-input').placeholder = busy ? 'DSH 正在处理该项目…' : '输入任务；键入 / 可选择 DSH 技能或命令…';
    $('#btn-send').disabled = !state.activeProjectId || busy;
    $('#btn-stop').classList.toggle('hidden', !busy);
  }
  function capabilityRows() {
    return [
      ...state.dsh.skills.map((item) => ({ ...item, kind: '技能' })),
      ...state.dsh.commands.map((item) => ({ ...item, kind: '命令' })),
    ];
  }
  function chooseCapability(name) {
    $('#chat-input').value = `/${name} `;
    autoGrow($('#chat-input')); $('#chat-input').focus();
    $('#slash-suggestions').classList.add('hidden');
  }
  function renderSlashSuggestions() {
    const panel = $('#slash-suggestions');
    const value = $('#chat-input').value;
    if (!value.trimStart().startsWith('/') || !state.dsh.sessionId) { panel.classList.add('hidden'); panel.innerHTML = ''; return; }
    const query = value.trimStart().slice(1).split(/\s/, 1)[0].toLowerCase();
    const rows = capabilityRows().filter((item) => !query || item.name.includes(query) || item.description?.toLowerCase().includes(query)).slice(0, 9);
    if (!rows.length) { panel.classList.add('hidden'); return; }
    panel.innerHTML = rows.map((item) => `<button class="slash-suggestion" data-capability="${esc(item.name)}" type="button"><code>/${esc(item.name)}</code><span>${esc(item.description || item.input?.hint || '')}</span><em>${item.kind}</em></button>`).join('');
    panel.classList.remove('hidden');
    $$('[data-capability]', panel).forEach((button) => button.addEventListener('click', () => chooseCapability(button.dataset.capability)));
  }
  function renderProjectRadar(p) {
    const card = state.cards.get(p.id) || p;
    const counts = card.counts || { requirements: p.requirements?.length || 0, testcases: p.testcases?.length || 0, milestones: p.milestones?.length || 0, reports: p.reports?.length || 0, defects: p.defects?.length || 0 };
    const columnIndex = Math.max(0, state.columns.findIndex((column) => column.id === p.status));
    const policy = p.assistant || { enabled: true, mode: 'full', reminders: 'all' };
    $('#case-radar').innerHTML = `<div class="radar-stage"><small>当前阶段</small><b>${esc(columnOf(p)?.title || p.status)}</b><div class="stage-track">${state.columns.map((column, index) => `<i class="${index <= columnIndex ? 'done' : ''}" style="--cc:${column.color}"></i>`).join('')}</div></div>
      <div class="radar-grid"><div class="radar-stat"><b>${counts.requirements}</b><span>需求</span></div><div class="radar-stat"><b>${counts.testcases}</b><span>用例</span></div><div class="radar-stat"><b>${counts.defects}</b><span>缺陷</span></div><div class="radar-stat"><b>${counts.milestones}</b><span>里程碑</span></div></div>
      <div class="assistant-policy-card"><b>${policy.enabled === false ? '自动辅助已关闭' : MODE_CN[policy.mode] || '全流程辅助'}</b>${policy.enabled === false ? 'DSH 只回答问题，不自动登记或推进。' : MODE_DESC[policy.mode] || MODE_DESC.full}<br/>提醒：${policy.reminders === 'off' ? '关闭' : policy.reminders === 'milestones' ? '仅里程碑' : '里程碑与流程'}</div>`;
  }
  function renderFeed() {
    const entries = state.activeProjectId ? state.feed.filter((entry) => entry.projectId === state.activeProjectId).slice(0, 20) : state.feed.slice(0, 20);
    $('#feed').innerHTML = entries.map((entry) => `<div class="feed-item"><span class="fi-icon">${FEED_ICON[entry.type] || '记'}</span><div class="fi-body"><div class="fi-label">${esc(entry.label)}</div><div class="fi-meta">${fmtTime(entry.ts)}</div></div></div>`).join('') || emptyHtml('暂无材料动态');
  }

  // ---------- drawer ----------
  const TABS = [['overview', '项目概览', '项'], ['requirements', '需求范围', '需'], ['testcases', '测试用例', '例'], ['defects', '缺陷管理', '缺'], ['milestones', '里程碑日程', '里'], ['reports', '测试报告', '报'], ['knowledge', '知识沉淀', '知'], ['minutes', '沟通纪要', '纪'], ['gates', '审批门禁', '审']];
  const TAB_META = {
    overview: ['项目档案', '项目概览', '基本信息、测试阶段与协作设置'],
    requirements: ['范围中心', '需求范围', '功能与非功能需求、风险点及验收标准'],
    testcases: ['用例中心', '测试用例', '草稿、评审与执行状态跟踪'],
    defects: ['缺陷中心', '缺陷管理', '严重级别、复现信息与修复状态'],
    milestones: ['时间管理', '里程碑与日程', '发布、评审、冻结及重要工作节点'],
    reports: ['报告中心', '测试报告', '查看 DSH 草稿、版本和提交状态'],
    knowledge: ['知识中心', '测试知识', '沉淀经验、规范与历史缺陷模式'],
    minutes: ['沟通记录', '沟通纪要', '需求讨论、评审会和测试复盘'],
    gates: ['人工控制', '负责人审批门禁', '关键评审与发布动作由负责人最终确认'],
  };
  async function openDrawer(id) {
    state.drawerTab = 'overview';
    $('#drawer-backdrop').classList.remove('hidden'); $('#drawer').classList.remove('hidden');
    await refreshDrawer(id);
  }
  function closeDrawer() { $('#drawer-backdrop').classList.add('hidden'); $('#drawer').classList.add('hidden'); }
  async function refreshDrawer(id) {
    try {
      const { project: p } = await api(`api/projects/${id}`);
      state.drawerProject = p;
      $('#drawer-title').textContent = p.title;
      $('#drawer-meta').innerHTML = `<span>${esc(p.projectKey || '未编号')}</span><span class="status-pill" style="background:${columnOf(p)?.color || '#64748b'}">${esc(columnOf(p)?.title || p.status)}</span>${p.product ? `<span>${esc(p.product)}</span>` : ''}`;
      const stageIndex = Math.max(0, state.columns.findIndex((column) => column.id === p.status));
      const stagePercent = state.columns.length > 1 ? Math.round(stageIndex / (state.columns.length - 1) * 100) : 0;
      $('#drawer-summary').innerHTML = `<div class="sidebar-stage"><div><span>测试进度</span><b>${esc(columnOf(p)?.title || p.status)}</b></div><div class="stage-track"><i style="width:${stagePercent}%"></i></div><small>${stageIndex + 1} / ${state.columns.length} 阶段</small></div>
        <div class="sidebar-facts"><div><span>对象类型</span><b>${KIND_CN[p.kind] || esc(p.kind)}</b></div><div><span>被测产品</span><b>${esc(p.product || '尚未填写')}</b></div><div><span>测试负责人</span><b>${esc(p.owner || '尚未填写')}</b></div><div><span>DSH 协作</span><b>${p.assistant?.enabled === false ? '已关闭' : MODE_CN[p.assistant?.mode] || '全流程辅助'}</b></div></div>`;
      $('#btn-drawer-folder').textContent = p.workspacePath ? '打开项目文件' : '创建项目文件';
      renderTabs(); renderTab(state.drawerTab);
    } catch (error) { toast(error.message, 'err'); }
  }
  function renderTabs() {
    const p = state.drawerProject;
    $('#tabs').innerHTML = TABS.map(([key, label, icon]) => {
      const count = p ? { requirements: p.requirements.length, testcases: p.testcases.length, defects: p.defects.length, milestones: p.milestones.length, reports: p.reports.length, knowledge: p.knowledge.length, minutes: p.minutes.length, gates: p.gates.filter((g) => g.status === 'pending').length }[key] : null;
      return `<button class="tab ${state.drawerTab === key ? 'active' : ''}" data-tab="${key}" type="button"><span class="tab-icon">${icon}</span><span>${label}</span>${count != null ? `<span class="tab-count">${count}</span>` : ''}</button>`;
    }).join('');
    $$('.tab', $('#tabs')).forEach((tab) => tab.addEventListener('click', () => { state.drawerTab = tab.dataset.tab; renderTabs(); renderTab(state.drawerTab); }));
  }
  function renderTab(tab) {
    const p = state.drawerProject; if (!p) return;
    const [kicker, title, subtitle] = TAB_META[tab] || TAB_META.overview;
    $('#drawer-section-kicker').textContent = kicker;
    $('#drawer-section-title').textContent = title;
    $('#drawer-section-subtitle').textContent = subtitle;
    ({ overview: renderOverview, requirements: renderRequirements, testcases: renderTestcases, defects: renderDefects, milestones: renderMilestones, reports: renderReports, knowledge: renderKnowledge, minutes: renderMinutes, gates: renderGates }[tab])($('#tab-body'), p);
  }
  function renderOverview(body, p) {
    const options = state.columns.map((column) => `<option value="${column.id}" ${p.status === column.id ? 'selected' : ''}>${esc(column.title)}</option>`).join('');
    const aiTitle = p.assistant?.enabled === false ? '自动辅助已关闭' : MODE_CN[p.assistant?.mode] || '全流程辅助';
    body.innerHTML = `<div class="overview-metrics"><div><span>需求范围</span><b>${p.requirements.length}</b></div><div><span>测试用例</span><b>${p.testcases.length}</b></div><div><span>缺陷</span><b>${p.defects.length}</b></div><div><span>测试报告</span><b>${p.reports.length}</b></div></div>
      <div class="detail-overview-grid">
        <section class="detail-card case-info-card"><div class="detail-card-head"><div><span>PROJECT PROFILE</span><h3>项目基本信息</h3></div><button class="btn sm" id="ov-add-schedule" type="button">＋ 新增日程</button></div>
          <div class="detail-form-grid"><div class="field span-2"><label>项目名称</label><input id="ov-title" value="${esc(p.title)}"/></div><div class="field"><label>项目编号</label><input id="ov-number" value="${esc(p.projectKey)}" placeholder="如 PRJ-2026-001"/></div><div class="field"><label>测试阶段</label><select id="ov-status">${options}</select></div><div class="field"><label>被测产品</label><input id="ov-product" value="${esc(p.product)}" placeholder="尚未填写"/></div><div class="field"><label>测试负责人</label><input id="ov-owner" value="${esc(p.owner)}" placeholder="尚未填写"/></div><div class="field span-2"><label>项目摘要 / 测试范围</label><textarea id="ov-summary" rows="6" placeholder="记录测试范围、重点链路和当前进展">${esc(p.summary)}</textarea></div></div>
        </section>
        <section class="detail-card ai-detail-card"><div class="detail-card-head"><div><span>DSH QA MODE</span><h3>DSH 协作策略</h3></div><i class="ai-state-dot ${p.assistant?.enabled === false ? 'off' : ''}"></i></div><strong>${aiTitle}</strong><p>${p.assistant?.enabled === false ? 'DSH 只回答问题，不主动登记或推进项目。' : MODE_DESC[p.assistant?.mode] || MODE_DESC.full}</p><div class="policy-facts"><span>自动提取 <b>${p.assistant?.autoExtract === false ? '关闭' : '开启'}</b></span><span>流程提醒 <b>${p.assistant?.reminders === 'off' ? '关闭' : p.assistant?.reminders === 'milestones' ? '仅里程碑' : '全部'}</b></span><span>对话模式 <b>DSH 测试模式</b></span></div><button class="btn sm wide" id="ov-policy" type="button">调整协作策略 <span>→</span></button></section>
        <section class="detail-card"><div class="detail-card-head"><div><span>TEAM</span><h3>项目成员</h3></div><span class="card-counter">${p.members.length} 人</span></div><div class="party-list">${p.members.map((member) => `<div class="party-row"><span class="party-avatar">${esc((member.name || '?').slice(0, 1))}</span><div><b>${esc(member.name)}</b><span>${ROLE_CN[member.role] || esc(member.role)}${member.contact ? ` · ${esc(member.contact)}` : ''}</span></div></div>`).join('') || emptyHtml('暂无成员信息')}</div></section>
        <section class="detail-card workspace-card"><div class="detail-card-head"><div><span>LOCAL FILES</span><h3>本地项目文件</h3></div></div><div class="folder-visual"><span>▰</span><div><b>${p.workspacePath ? esc(p.workspacePath.split('/').pop()) : '尚未创建项目目录'}</b><p>${p.workspacePath ? esc(p.workspacePath) : '自动生成需求、计划、用例、数据、执行、缺陷、报告和归档目录。'}</p></div></div><button class="btn sm wide" id="ov-workspace" type="button">${p.workspacePath ? '在 Finder 中打开' : '创建标准项目目录'} <span>→</span></button></section>
        <section class="detail-card timeline-card span-2"><div class="detail-card-head"><div><span>PROJECT TIMELINE</span><h3>阶段时间线</h3></div></div><div class="case-timeline">${p.history.slice(-8).reverse().map((h) => `<div class="timeline-row"><i></i><div><b>${esc(h.from ? columnOf({ status: h.from })?.title : '创建项目')} → ${esc(columnOf({ status: h.to })?.title || h.to)}</b><span>${h.by === 'ai' ? 'AI 自动推进' : h.by === 'seed' ? '系统示例' : '负责人操作'} · ${fmtDateFull(h.at)}</span></div></div>`).join('') || emptyHtml('暂无阶段记录')}</div></section>
      </div>
      <div class="detail-action-bar"><button class="btn sm" id="ov-new-chat" type="button">新建 DSH 对话</button><button class="btn sm danger" id="ov-delete" type="button">删除项目记录</button><span></span><button class="btn primary" id="ov-save" type="button">保存项目信息</button></div>`;
    $('#ov-save', body).addEventListener('click', async () => { try {
      await api(`api/projects/${p.id}`, { method: 'PATCH', body: { title: $('#ov-title', body).value.trim(), projectKey: $('#ov-number', body).value.trim(), product: $('#ov-product', body).value.trim(), owner: $('#ov-owner', body).value.trim(), summary: $('#ov-summary', body).value.trim() } });
      if ($('#ov-status', body).value !== p.status) await api(`api/projects/${p.id}/transition`, { method: 'POST', body: { to: $('#ov-status', body).value } });
      toast('项目信息已保存', 'ok'); await refreshDrawer(p.id);
    } catch (e) { toast(e.message, 'err'); } });
    $('#ov-add-schedule', body).addEventListener('click', () => openScheduleModal(localDate(new Date()), p.id));
    $('#ov-policy', body).addEventListener('click', () => openAssistantPolicy(p));
    $('#ov-workspace', body).addEventListener('click', () => openWorkspace(p.id));
    $('#ov-new-chat', body).addEventListener('click', async () => { if (!confirm('确认给本项目新建一个 DSH 测试模式对话？原会话仍保留在 DSH 历史中。')) return; try { await createFreshDshSession(p); closeDrawer(); await openProject(p.id); toast('已新建并绑定 DSH 测试模式对话', 'ok'); } catch (error) { toast(error.message, 'err'); } });
    $('#ov-delete', body).addEventListener('click', async () => { if (!confirm(`确定删除项目记录“${p.title}”？本地项目文件夹会保留。`)) return; await api(`api/projects/${p.id}`, { method: 'DELETE' }); toast('项目记录已删除，文件夹仍保留', 'ok'); closeDrawer(); });
  }
  function renderRequirements(body, p) {
    body.innerHTML = `<div class="list">${p.requirements.map((r) => `<div class="list-item"><div class="li-title">${esc(r.title)} <span class="badge">${REQ_KIND_CN[r.kind] || r.kind}</span></div><div class="li-sub">${esc(r.statement)}</div>${r.acceptance ? `<div class="li-meta">验收：${esc(r.acceptance)}</div>` : ''}${r.links?.map((link) => `<div class="li-sub">覆盖用例：${esc(p.testcases.find((t) => t.id === link.testcaseId)?.title || '未知')} · ${esc(link.purpose)}</div>`).join('') || ''}</div>`).join('') || emptyHtml('暂无需求或测试范围。')}</div>`;
  }
  function renderTestcases(body, p) {
    body.innerHTML = `<div class="list">${p.testcases.map((t) => `<div class="list-item"><div class="li-title">${esc(t.title)} <span class="badge">${TC_KIND_CN[t.kind] || t.kind}</span> <span class="badge">${esc(t.priority)}</span></div><div class="li-sub">${esc(t.preconditions || '')}${t.steps ? `<div class="tc-steps">步骤：${esc(t.steps)}</div>` : ''}${t.expected ? `<div class="tc-steps">预期：${esc(t.expected)}</div>` : ''}</div><div class="li-meta"><select class="status-select" data-id="${t.id}"><option value="draft" ${t.status === 'draft' ? 'selected' : ''}>草稿</option><option value="reviewed" ${t.status === 'reviewed' ? 'selected' : ''}>已评审</option><option value="executed" ${t.status === 'executed' ? 'selected' : ''}>已执行</option></select></div></div>`).join('') || emptyHtml('暂无测试用例，告诉 AI 需求即可生成。')}</div>`;
    $$('.status-select', body).forEach((select) => select.addEventListener('change', async () => { try { await api(`api/projects/${p.id}/testcases/${select.dataset.id}/status`, { method: 'POST', body: { status: select.value } }); toast('用例状态已更新', 'ok'); } catch (e) { toast(e.message, 'err'); } }));
  }
  function renderDefects(body, p) {
    body.innerHTML = `<div class="list">${p.defects.map((d) => `<div class="list-item"><div class="li-title">${esc(d.title)} <span class="badge ${d.severity === 'critical' || d.severity === 'major' ? 'danger' : ''}">${SEVERITY_CN[d.severity] || d.severity}</span></div><div class="li-sub">${esc(d.environment ? `环境：${d.environment}` : '')}${d.module ? ` · 模块：${esc(d.module)}` : ''}</div>${d.steps ? `<div class="tc-steps">复现：${esc(d.steps)}</div>` : ''}${d.expected ? `<div class="tc-steps">预期：${esc(d.expected)}</div>` : ''}${d.actual ? `<div class="tc-steps">实际：${esc(d.actual)}</div>` : ''}<div class="li-meta"><select class="status-select" data-id="${d.id}"><option value="open" ${d.status === 'open' ? 'selected' : ''}>待处理</option><option value="fixing" ${d.status === 'fixing' ? 'selected' : ''}>修复中</option><option value="verify" ${d.status === 'verify' ? 'selected' : ''}>待验证</option><option value="closed" ${d.status === 'closed' ? 'selected' : ''}>已关闭</option></select></div></div>`).join('') || emptyHtml('暂无缺陷记录。')}</div>`;
    $$('.status-select', body).forEach((select) => select.addEventListener('change', async () => { try { await api(`api/projects/${p.id}/defects/${select.dataset.id}/status`, { method: 'POST', body: { status: select.value } }); toast('缺陷状态已更新', 'ok'); } catch (e) { toast(e.message, 'err'); } }));
  }
  function renderMilestones(body, p) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const milestones = [...p.milestones].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const events = [...p.events].sort((a, b) => a.date.localeCompare(b.date));
    body.innerHTML = `<div class="tab-toolbar"><div><b>共 ${milestones.length + events.length} 个时间节点</b><span>日程和里程碑会同步进入日历排期</span></div><button class="btn primary sm" id="dl-add" type="button">＋ 新增日程</button></div>
      <section class="record-section"><h3>里程碑与截止日 <span>${milestones.length}</span></h3><div class="list">${milestones.map((m) => { const days = Math.round((new Date(m.dueDate + 'T00:00:00') - today) / 86400000); const badge = m.done ? '<span class="badge">已完成</span>' : days < 0 ? `<span class="badge danger">逾期 ${-days} 天</span>` : days <= 7 ? `<span class="badge warn">${days === 0 ? '今天' : days + '天后'}到期</span>` : `<span class="badge">${days} 天后</span>`; return `<div class="list-item"><div class="li-title">${esc(m.title)} ${badge}</div><div class="li-meta"><span>截止日 ${esc(m.dueDate)}</span><span>${MS_KIND_CN[m.kind] || m.kind}</span>${m.basis ? `<span>依据 ${esc(m.basis)}</span>` : ''}</div></div>`; }).join('') || emptyHtml('暂无里程碑')}</div></section>
      <section class="record-section"><h3>会议与工作日程 <span>${events.length}</span></h3><div class="list">${events.map((event) => `<div class="list-item"><div class="li-title">${esc(event.title)} <span class="badge doc">${EVENT_KIND_CN[event.kind] || '日程'}</span></div><div class="li-meta"><span>${esc(event.date)}</span>${event.note ? `<span>${esc(event.note)}</span>` : ''}</div></div>`).join('') || emptyHtml('暂无日程')}</div></section>`;
    $('#dl-add', body).addEventListener('click', () => openScheduleModal(localDate(new Date()), p.id));
  }
  function renderReports(body, p) {
    body.innerHTML = `<div class="list">${p.reports.map((doc) => `<div class="list-item" data-doc-id="${doc.id}"><div class="li-title">${esc(doc.title)} <span class="badge doc">${REPORT_CN[doc.docType] || doc.docType}</span> <span class="badge">v${doc.versions.length}</span></div><div class="li-meta">状态：${doc.status === 'draft' ? '草稿' : esc(doc.status)}</div><div class="li-actions"><button class="btn sm" data-view-doc type="button">查看最新版本</button></div></div>`).join('') || emptyHtml('暂无报告记录。')}</div>`;
    $$('[data-view-doc]', body).forEach((button) => button.addEventListener('click', () => { const item = button.closest('.list-item'); const doc = p.reports.find((d) => d.id === item.dataset.docId); const old = $('.doc-view', item); if (old) return old.remove(); const view = document.createElement('div'); view.className = 'doc-view'; view.textContent = doc?.versions.at(-1)?.content || '暂无内容'; item.appendChild(view); }));
  }
  function renderKnowledge(body, p) { body.innerHTML = `<div class="list">${p.knowledge.map((k) => `<div class="list-item"><div class="li-title">${esc(k.title)} <span class="badge">${esc(k.source)}</span></div><div class="li-sub">${esc(k.summary)}</div><div class="li-meta">${fmtDateFull(k.at)}</div></div>`).join('') || emptyHtml('暂无测试知识沉淀。')}</div>`; }
  function renderMinutes(body, p) { body.innerHTML = `<div class="list">${[...p.minutes].reverse().map((m) => `<div class="list-item"><div class="li-title">${esc(m.title)}</div><div class="li-sub">${esc(m.content)}</div><div class="li-meta">${fmtDateFull(m.at)}</div></div>`).join('') || emptyHtml('暂无会议或讨论纪要。')}</div>`; }
  function renderGates(body, p) {
    body.innerHTML = `<div class="list">${p.gates.map((gate) => { const badge = gate.status === 'pending' ? '<span class="badge gate">待负责人审批</span>' : gate.status === 'approved' ? '<span class="badge doc">已通过</span>' : '<span class="badge danger">已驳回</span>'; return `<div class="list-item" data-gate-id="${gate.id}"><div class="li-title">${esc(gate.title)} ${badge} <span class="badge">${GATE_CN[gate.type] || gate.type}</span></div><div class="li-sub">${esc(gate.summary || '')}</div>${gate.status === 'pending' ? '<div class="li-actions"><button class="btn sm primary" data-decision="approve" type="button">通过</button><button class="btn sm danger" data-decision="reject" type="button">驳回</button></div>' : ''}</div>`; }).join('') || emptyHtml('暂无待审批门禁。')}</div>`;
    $$('[data-decision]', body).forEach((button) => button.addEventListener('click', async () => { if (button.dataset.decision === 'approve' && !confirm('确认通过该门禁？')) return; const item = button.closest('.list-item'); try { await api(`api/projects/${p.id}/gates/${item.dataset.gateId}/decide`, { method: 'POST', body: { decision: button.dataset.decision } }); toast('门禁已处理', 'ok'); } catch (e) { toast(e.message, 'err'); } }));
  }

  // ---------- modals and workspaces ----------
  function closeModal() { $('#modal-root').innerHTML = ''; }
  function modalShell(title, subtitle, body, wide = false) {
    $('#modal-root').innerHTML = `<div class="modal-backdrop"><div class="modal ${wide ? 'wide' : ''}"><h3>${title}</h3>${subtitle ? `<p class="modal-sub">${subtitle}</p>` : ''}${body}</div></div>`;
    $('.modal-backdrop').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeModal(); });
    return $('.modal');
  }
  async function openDshCapabilities() {
    if (!state.activeProject) return toast('请先选择项目', 'err');
    if (!state.dshEmbedded) return toast('请从 DSH 侧边栏打开“质量工作台”后使用技能与命令', 'err');
    try {
      await initializeDshChat({ initialize: true });
      const modal = modalShell('DSH 技能与命令', `已绑定“${esc(state.activeProject.title)}”的独立 DSH 会话；点击能力即可插入输入框。`, `
        <div class="capability-toolbar"><div class="capability-tabs"><button class="active" data-cap-tab="skill" type="button">技能 ${state.dsh.skills.length}</button><button data-cap-tab="command" type="button">命令 ${state.dsh.commands.length}</button></div><input id="cap-search" class="capability-search" type="search" placeholder="搜索名称、用途或说明…"/></div>
        <div id="cap-list" class="capability-list"></div>
        <p class="capability-footnote">技能通过 DSH 原生会话运行，可继续调用 DSH 工具并按权限策略请求确认；命令直接作用于本项目会话。输入框中也可以直接键入“/”检索。</p>
        <div class="modal-foot"><button class="btn" id="cap-close" type="button">关闭</button></div>`, true);
      modal.classList.add('capability-modal');
      let tab = 'skill';
      const render = () => {
        const query = $('#cap-search', modal).value.trim().toLowerCase();
        const source = tab === 'skill' ? state.dsh.skills : state.dsh.commands;
        const rows = source.filter((item) => !query || item.name.toLowerCase().includes(query) || item.description?.toLowerCase().includes(query) || item.whenToUse?.toLowerCase().includes(query));
        $('#cap-list', modal).innerHTML = rows.map((item) => `<button class="capability-row" data-pick-cap="${esc(item.name)}" type="button"><code>/${esc(item.name)}</code><span>${esc(item.whenToUse || item.description || item.input?.hint || '无说明')}</span><em>${tab === 'skill' ? (item.modelInvocable === false ? '仅手动' : 'DSH 技能') : (item.input?.hint || 'DSH 命令')}</em></button>`).join('') || emptyHtml('没有匹配的能力');
        $$('[data-pick-cap]', modal).forEach((button) => button.addEventListener('click', () => { chooseCapability(button.dataset.pickCap); closeModal(); }));
      };
      $$('[data-cap-tab]', modal).forEach((button) => button.addEventListener('click', () => { tab = button.dataset.capTab; $$('[data-cap-tab]', modal).forEach((el) => el.classList.toggle('active', el === button)); render(); }));
      $('#cap-search', modal).addEventListener('input', render);
      $('#cap-close', modal).addEventListener('click', closeModal);
      render();
      setTimeout(() => $('#cap-search', modal).focus(), 30);
    } catch (error) { toast(error.message, 'err'); }
  }
  function openScheduleModal(date = state.selectedDate, preferredProjectId = '') {
    const projects = sortedCards().filter((card) => card.status !== 'closed');
    if (!projects.length) { toast('请先创建一个测试项目或迭代', 'err'); return; }
    const requestedProjectId = preferredProjectId || state.activeProjectId;
    const selectedProjectId = projects.some((card) => card.id === requestedProjectId) ? requestedProjectId : projects[0].id;
    const projectOptions = projects.map((card) => `<option value="${card.id}" ${card.id === selectedProjectId ? 'selected' : ''}>${esc(card.title)}</option>`).join('');
    const modal = modalShell('新建日程', '关联到具体项目，保存后会同步显示在首页提醒和项目档案中。', `
      <div class="schedule-type-switch"><button class="active" data-schedule-type="event" type="button">工作日程</button><button data-schedule-type="milestone" type="button">里程碑 / 截止日</button></div>
      <div class="modal-grid schedule-form">
        <div class="field span-2"><label>关联项目 *</label><select id="sc-case">${projectOptions}</select></div>
        <div class="field span-2"><label>事项名称 *</label><input id="sc-title" placeholder="如：用例评审会、版本发布"/></div>
        <div class="field"><label>日期 *</label><input id="sc-date" type="date" value="${esc(date)}"/></div>
        <div class="field"><label>类型</label><select id="sc-kind"></select></div>
        <div class="field span-2"><label id="sc-note-label">备注</label><textarea id="sc-note" rows="3" placeholder="地点、参加人、准备事项等"></textarea></div>
      </div>
      <div class="modal-foot"><button class="btn" id="sc-cancel" type="button">取消</button><button class="btn primary" id="sc-ok" type="button">保存日程</button></div>`);
    let type = 'event';
    const renderKinds = () => {
      const source = type === 'milestone' ? MS_KIND_CN : EVENT_KIND_CN;
      $('#sc-kind', modal).innerHTML = Object.entries(source).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
      $('#sc-note-label', modal).textContent = type === 'milestone' ? '依据 / 计算说明' : '备注';
      $('#sc-note', modal).placeholder = type === 'milestone' ? '如：发布排期、评审范围' : '地点、参加人、准备事项等';
      $('#sc-ok', modal).textContent = type === 'milestone' ? '保存里程碑' : '保存日程';
    };
    renderKinds();
    $$('[data-schedule-type]', modal).forEach((button) => button.addEventListener('click', () => {
      type = button.dataset.scheduleType;
      $$('[data-schedule-type]', modal).forEach((el) => el.classList.toggle('active', el === button));
      renderKinds();
    }));
    $('#sc-cancel', modal).addEventListener('click', closeModal);
    $('#sc-ok', modal).addEventListener('click', async () => {
      const title = $('#sc-title', modal).value.trim();
      const pickedDate = $('#sc-date', modal).value;
      if (!title || !pickedDate) return toast('请填写事项名称和日期', 'err');
      try {
        await api(`api/projects/${$('#sc-case', modal).value}/schedule`, { method: 'POST', body: { type, title, date: pickedDate, kind: $('#sc-kind', modal).value, note: $('#sc-note', modal).value.trim() } });
        state.selectedDate = pickedDate;
        const picked = new Date(pickedDate + 'T00:00:00');
        state.calendarCursor = new Date(picked.getFullYear(), picked.getMonth(), 1);
        closeModal();
        await refreshBoard(false);
        toast(type === 'milestone' ? '里程碑已登记' : '日程已添加', 'ok');
      } catch (error) { toast(error.message, 'err'); }
    });
    setTimeout(() => $('#sc-title', modal).focus(), 30);
  }
  function openNewProject(isIteration = false) {
    const modal = modalShell(isIteration ? '新建测试迭代' : '新建测试项目', isIteration ? '迭代挂靠在测试项目下，共享产品与负责人信息。' : '创建独立项目空间，并按需启用 DSH 全流程辅助。', `
      <div class="modal-grid"><div class="field span-2"><label>${isIteration ? '迭代名称 *' : '项目名称 *'}</label><input id="nc-title" placeholder="${isIteration ? '如：订单域 3 月迭代（v1.2.0）' : '如：电商中台订单服务测试项目'}"/></div>
      <div class="field"><label>对象类型</label><select id="nc-type"><option value="project">测试项目</option><option value="iteration">迭代</option></select></div><div class="field"><label>项目编号</label><input id="nc-number" placeholder="如 PRJ-2026-001"/></div>
      <div class="field"><label>被测产品</label><input id="nc-product" placeholder="如 电商中台 · 订单域"/></div><div class="field"><label>测试负责人</label><input id="nc-owner" placeholder="如 张测试"/></div>
      <div class="field span-2"><label>成员（每行：姓名:角色）</label><textarea id="nc-members" rows="2" placeholder="张测试:负责人&#10;李开发:开发&#10;王产品:产品"></textarea></div><div class="field span-2"><label>项目摘要 / 测试范围</label><textarea id="nc-summary" rows="3" placeholder="测试范围、重点链路、风险…"></textarea></div></div>
      <div class="field"><label>DSH 辅助模式</label><div class="mode-options"><button class="mode-option active" data-mode="full" type="button"><b>全流程辅助</b><span>主动提取、登记并提醒</span></button><button class="mode-option" data-mode="manual" type="button"><b>按需协作</b><span>明确要求时才执行</span></button></div></div>
      <label class="switch-row"><span class="switch-copy"><b>自动提取测试要素</b><span>从对话识别需求、用例、缺陷、里程碑与日程</span></span><input id="nc-extract" type="checkbox" checked/></label>
      <label class="switch-row"><span class="switch-copy"><b>全流程提醒</b><span>在首页提示临期、逾期与待审批事项</span></span><input id="nc-reminders" type="checkbox" checked/></label>
      <label class="switch-row"><span class="switch-copy"><b>创建本地项目文件夹</b><span>自动生成需求、计划、用例、数据、执行、缺陷、报告和归档目录</span></span><input id="nc-workspace" type="checkbox" checked/></label>
      <div class="modal-foot"><button class="btn" id="nc-cancel" type="button">取消</button><button class="btn primary" id="nc-ok" type="button">${isIteration ? '创建迭代' : '创建项目'}</button></div>`, true);
    let mode = 'full';
    $$('.mode-option', modal).forEach((button) => button.addEventListener('click', () => { mode = button.dataset.mode; $$('.mode-option', modal).forEach((el) => el.classList.toggle('active', el === button)); }));
    $('#nc-cancel', modal).addEventListener('click', closeModal);
    $('#nc-ok', modal).addEventListener('click', async () => {
      const title = $('#nc-title', modal).value.trim();
      if (!title) return toast('请填写名称', 'err');
      const members = $('#nc-members', modal).value.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => { const [name, role] = line.split(/[:：]/).map((value) => value.trim()); return { name: name || line, role: ROLE_EN[role] || 'other' }; });
      try {
        const result = await api('api/projects', { method: 'POST', body: { title, kind: isIteration ? 'iteration' : $('#nc-type', modal).value, projectKey: $('#nc-number', modal).value.trim(), product: $('#nc-product', modal).value.trim(), owner: $('#nc-owner', modal).value.trim(), summary: $('#nc-summary', modal).value.trim(), members, assistant: { enabled: true, mode, autoExtract: $('#nc-extract', modal).checked, reminders: $('#nc-reminders', modal).checked ? 'all' : 'off' }, createWorkspace: $('#nc-workspace', modal).checked } });
        closeModal(); toast('项目与文件夹已创建', 'ok'); await openProject(result.project.id);
      } catch (error) { toast(error.message, 'err'); }
    });
    setTimeout(() => $('#nc-title', modal).focus(), 30);
  }
  function openAssistantPolicy(p = state.activeProject) {
    if (!p) return;
    const assistant = { enabled: true, mode: 'full', autoExtract: true, reminders: 'all', ...(p.assistant || {}) };
    const modal = modalShell('DSH 辅助策略', `仅作用于“${p.title}”，随时可以关闭或切换。`, `
      <label class="switch-row"><span class="switch-copy"><b>启用本项目 DSH 辅助</b><span>关闭后仍可对话，但不会自动调用登记工具</span></span><input id="ap-enabled" type="checkbox" ${assistant.enabled !== false ? 'checked' : ''}/></label>
      <div class="field" style="margin-top:14px"><label>工作模式</label><div class="mode-options">${['full', 'manual'].map((mode) => `<button class="mode-option ${assistant.mode === mode ? 'active' : ''}" data-mode="${mode}" type="button"><b>${MODE_CN[mode]}</b><span>${MODE_DESC[mode]}</span></button>`).join('')}</div></div>
      <label class="switch-row"><span class="switch-copy"><b>自动提取测试要素</b><span>登记需求、用例、缺陷、里程碑、日程和报告</span></span><input id="ap-extract" type="checkbox" ${assistant.autoExtract !== false ? 'checked' : ''}/></label>
      <div class="field" style="margin-top:14px"><label>提醒策略</label><select id="ap-reminders"><option value="all">里程碑与流程提醒</option><option value="milestones">仅里程碑提醒</option><option value="off">关闭首页提醒</option></select></div>
      <div class="field-note" style="margin-top:12px">对话模型不在此处设置；工作台只使用本项目 DSH 会话的模型，可在对话顶部从 DSH 模型目录切换。</div>
      <div class="modal-foot"><button class="btn" id="ap-cancel" type="button">取消</button><button class="btn primary" id="ap-save" type="button">保存策略</button></div>`);
    let mode = assistant.mode;
    $('#ap-reminders', modal).value = assistant.reminders || 'all';
    $$('.mode-option', modal).forEach((button) => button.addEventListener('click', () => { mode = button.dataset.mode; $$('.mode-option', modal).forEach((el) => el.classList.toggle('active', el === button)); }));
    $('#ap-cancel', modal).addEventListener('click', closeModal);
    $('#ap-save', modal).addEventListener('click', async () => {
      try {
        await api(`api/projects/${p.id}`, { method: 'PATCH', body: { assistant: { enabled: $('#ap-enabled', modal).checked, mode, autoExtract: $('#ap-extract', modal).checked, reminders: $('#ap-reminders', modal).value } } });
        closeModal(); toast('DSH 辅助策略已保存', 'ok'); await loadChat(p.id, false);
      } catch (error) { toast(error.message, 'err'); }
    });
  }
  async function openWorkspace(projectId) {
    try { const result = await api(`api/projects/${projectId}/workspace/open`, { method: 'POST', body: {} }); toast(`已打开：${result.path.split('/').pop()}`, 'ok'); }
    catch (error) { toast(error.message, 'err'); }
  }
  async function createFreshDshSession(p) {
    if (!state.dshEmbedded) throw new Error('请从 DSH 侧边栏打开“质量工作台”');
    if (!p.workspacePath) {
      const workspace = await api(`api/projects/${p.id}/workspace`, { method: 'POST', body: {} });
      p.workspacePath = workspace.path;
    }
    const qaPreset = await getQaPreset();
    const created = await dshRpc('session.create', { cwd: p.workspacePath, agentPreset: qaPreset.id });
    await dshRpc('session.rename', { sessionId: created.sessionId, title: `质量｜${p.title}` }).catch(() => {});
    await api(`api/projects/${p.id}`, { method: 'PATCH', body: { dshSessionId: created.sessionId } });
    p.dshSessionId = created.sessionId;
    if (state.activeProjectId === p.id) state.dsh = { projectId: null, sessionId: '', skills: [], commands: [], models: null, qaPreset, busy: false, turnToken: state.dsh.turnToken + 1 };
    return created.sessionId;
  }
  async function pairApi(path, options = {}) {
    if (!state.dshEmbedded) throw new Error('DSH Remote 仅在 DSH 内嵌工作台中可用');
    const response = await fetch(`/api/pair/${path}`, {
      method: options.method || 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const reason = data.code === 'lan-required' ? '请先在 DSH Remote 设置中启用自动公网隧道或配置 publicBaseUrl' : data.code;
      throw new Error(data.error || data.message || reason || `Remote 请求失败 (${response.status})`);
    }
    return data;
  }
  function updateRemoteBadge(status = state.remote.status) {
    const button = $('#btn-remote');
    button.classList.remove('ready', 'paired', 'blocked');
    if (!state.dshEmbedded) { button.classList.add('blocked'); button.title = '请从 DSH 中打开工作台'; return; }
    if (!status) { button.title = '打开 DSH Remote'; return; }
    if (status.paired || status.deviceCount > 0) button.classList.add('paired');
    else if (status.lanAvailable) button.classList.add('ready');
    else button.classList.add('blocked');
    button.title = status.paired ? `Remote 已连接（${status.onlineCount || status.deviceCount || 1} 台在线）` : status.lanAvailable ? 'DSH Remote 可配对' : 'DSH Remote 需要局域网监听';
  }
  async function refreshRemoteStatus(quiet = true) {
    try {
      state.remote.status = await pairApi('status');
      updateRemoteBadge();
      return state.remote.status;
    } catch (error) {
      state.remote.status = null;
      updateRemoteBadge();
      if (!quiet) toast(error.message, 'err');
      return null;
    }
  }
  function remoteStatusView(status) {
    if (!state.dshEmbedded) return { title: '请在 DSH 中打开', detail: '独立网页无法访问 DSH Remote；请从 DSH 侧边栏进入质量工作台。', tone: 'blocked' };
    if (!status) return { title: '正在读取 Remote 状态', detail: '正在连接 DSH 自带的远程控制插件。', tone: '' };
    if (status.paired || status.deviceCount > 0) return { title: '手机端已配对', detail: `${status.onlineCount || 0} 台在线，${status.deviceCount || 0} 台已授权；可从手机继续操作当前 DSH。`, tone: 'paired' };
    if (!status.lanAvailable || status.phase === 'lan-required') return { title: '需要设置安全的远程入口', detail: 'Remote 已安装，但当前 DSH 版本只允许监听 127.0.0.1。请到 DSH 设置 → 插件 → Remote 开启“自动公网隧道”（推荐），或填写可信的 publicBaseUrl，再返回此处生成一次性配对链接。', tone: 'blocked' };
    if (status.phase === 'waiting') return { title: '等待手机扫码 / 打开链接', detail: '一次性链接已创建，在手机浏览器中打开即可完成配对。', tone: 'ready' };
    return { title: 'Remote 已就绪', detail: '生成一次性链接后，可在同一局域网的手机上接管 DSH 会话。', tone: 'ready' };
  }
  function copyText(value) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
    const input = document.createElement('textarea'); input.value = value; document.body.append(input); input.select(); document.execCommand('copy'); input.remove(); return Promise.resolve();
  }
  async function openRemotePanel() {
    const status = await refreshRemoteStatus(true);
    const view = remoteStatusView(status);
    const addresses = status?.lanAddresses || [];
    const modal = modalShell('DSH Remote', '使用 DSH 当前安装的 Remote 插件，把手机安全配对到本机；不创建第二套远程服务。', `
      <div class="remote-status-card"><span class="remote-status-icon">R</span><div class="remote-status-copy"><b>${esc(view.title)}</b><span>${esc(view.detail)}</span></div>${addresses.length ? `<div class="remote-addresses">${addresses.map((address) => `<code>${esc(address)}</code>`).join('')}</div>` : ''}</div>
      ${state.remote.url ? `<div class="remote-link"><input id="remote-url" value="${esc(state.remote.url)}" readonly/><button id="remote-copy" class="btn" type="button">复制链接</button></div>` : ''}
      <div class="remote-actions">
        <button id="remote-issue" class="btn primary" type="button" ${!status?.lanAvailable ? 'disabled' : ''}>生成一次性配对链接</button>
        <button id="remote-mobile" class="btn" type="button">打开手机端页面</button>
        ${status?.paired || status?.phase === 'waiting' ? '<button id="remote-stop" class="btn danger" type="button">停止配对 / 撤销</button>' : ''}
      </div>
      <p class="remote-note">配对链接由 DSH Remote 生成并设有有效期。测试数据仍保存在本机；启用远程入口后，请妥善保管链接，并在用完后停止 Remote 或关闭 DSH。</p>
      <div class="modal-foot"><button class="btn" id="remote-refresh" type="button">刷新状态</button><button class="btn primary" id="remote-close" type="button">完成</button></div>`);
    $('#remote-close', modal).addEventListener('click', closeModal);
    $('#remote-refresh', modal).addEventListener('click', openRemotePanel);
    $('#remote-mobile', modal).addEventListener('click', () => window.open('/m', '_blank', 'noopener'));
    $('#remote-issue', modal).addEventListener('click', async () => {
      try {
        const result = await pairApi('issue', { method: 'POST', body: {} });
        state.remote.url = result.url || result.pairingUrl || '';
        state.remote.expiresAt = result.expiresAt || 0;
        state.remote.status = await refreshRemoteStatus(true);
        toast('一次性 Remote 配对链接已生成', 'ok');
        openRemotePanel();
      } catch (error) { toast(error.message, 'err'); }
    });
    $('#remote-copy', modal)?.addEventListener('click', async () => { await copyText(state.remote.url); toast('配对链接已复制', 'ok'); });
    $('#remote-stop', modal)?.addEventListener('click', async () => {
      try { await pairApi('stop', { method: 'POST', body: {} }); state.remote.url = ''; await refreshRemoteStatus(true); toast('Remote 配对已停止', 'ok'); openRemotePanel(); }
      catch (error) { toast(error.message, 'err'); }
    });
  }
  function showPassScene() {
    const scene = $('#theme-scene');
    scene.classList.remove('active');
    void scene.offsetWidth;
    scene.classList.add('active');
    setTimeout(() => scene.classList.remove('active'), 1450);
  }
  function applyTheme(theme, persist = true) {
    state.theme = THEMES[theme] ? theme : 'dashboard';
    document.body.dataset.theme = state.theme;
    $('#theme-label').textContent = THEMES[state.theme].label;
    if (persist) localStorage.setItem('dsh-qa-theme', state.theme);
    if (persist && state.theme === 'cyber') setTimeout(showPassScene, 120);
  }
  function openSettings() {
    const modal = modalShell('界面风格与布局', '四套皮肤只改变工作台外观；模型、技能和测试模式仍完全来自 DSH。', `
      <div class="theme-picker">
        <button class="theme-option ${state.theme === 'dashboard' ? 'active' : ''}" data-theme-option="dashboard" type="button"><span class="theme-preview dashboard"><i></i><i></i><i></i></span><b>质量仪表</b><small>清爽 QA 面板蓝、通过率绿与测试徽章，默认外观。</small><em>当前</em></button>
        <button class="theme-option ${state.theme === 'terminal' ? 'active' : ''}" data-theme-option="terminal" type="button"><span class="theme-preview terminal"><i></i><i></i><i></i></span><b>终端</b><small>深色终端绿与等宽字体，命令行质感。</small><em>当前</em></button>
        <button class="theme-option ${state.theme === 'minimal' ? 'active' : ''}" data-theme-option="minimal" type="button"><span class="theme-preview minimal"><i></i><i></i><i></i></span><b>极简</b><small>纯白留白、细线与安静的黑灰层次。</small><em>当前</em></button>
        <button class="theme-option ${state.theme === 'cyber' ? 'active' : ''}" data-theme-option="cyber" type="button"><span class="theme-preview cyber"><i></i><i></i><i></i></span><b>赛博</b><small>霓虹紫、深空黑与发光描边，附带可触发的 BUILD PASSED 场景。</small><em>当前</em></button>
      </div>
      <div class="layout-settings"><h4>工作区宽度</h4><p>主导航、项目栏与项目雷达的边缘均可拖动；双击边缘恢复默认，箭头键可微调。</p><div class="layout-presets"><button class="layout-preset" data-layout-preset="compact" type="button"><b>紧凑</b><span>170 / 190 / 230</span></button><button class="layout-preset" data-layout-preset="standard" type="button"><b>标准</b><span>184 / 220 / 260</span></button><button class="layout-preset" data-layout-preset="focus" type="button"><b>专注对话</b><span>收起项目栏与雷达</span></button></div></div>
      <p class="theme-hint">模型只从 DSH 当前会话的模型目录读取；如需新增服务商或模型，请在 DSH 设置中配置。</p>
      <div class="modal-foot"><button class="btn" id="st-pass" type="button" ${state.theme === 'cyber' ? '' : 'disabled'}>BUILD PASSED</button><button class="btn primary" id="st-close" type="button">完成</button></div>`, true);
    $$('[data-theme-option]', modal).forEach((button) => button.addEventListener('click', () => {
      applyTheme(button.dataset.themeOption);
      $$('[data-theme-option]', modal).forEach((item) => item.classList.toggle('active', item === button));
      $('#st-pass', modal).disabled = state.theme !== 'cyber';
    }));
    $$('[data-layout-preset]', modal).forEach((button) => button.addEventListener('click', () => {
      const preset = button.dataset.layoutPreset;
      if (preset === 'compact') applyLayout({ rail: 170, cases: 190, context: 230, railCollapsed: false, casesCollapsed: false, contextCollapsed: false });
      if (preset === 'standard') applyLayout(DEFAULT_LAYOUT);
      if (preset === 'focus') applyLayout({ rail: 170, railCollapsed: false, casesCollapsed: true, contextCollapsed: true });
      toast('工作区布局已更新', 'ok');
    }));
    $('#st-pass', modal).addEventListener('click', showPassScene);
    $('#st-close', modal).addEventListener('click', closeModal);
  }

  // ---------- state updates and SSE ----------
  function updateCard(card) {
    state.cards.set(card.id, card);
    if ($('#board .col')) { appendCardEl(card); updateColCounts(); }
    renderRailCases(); renderCaseList(); renderDashboard();
    if (card.id === state.activeProjectId) { updateChatHead({ ...(state.activeProject || {}), ...card }); renderProjectRadar({ ...(state.activeProject || {}), ...card }); }
  }
  function removeCard(id) {
    state.cards.delete(id);
    $$(`.card[data-id="${id}"]`).forEach((el) => el.remove());
    if (state.activeProjectId === id) { state.activeProjectId = null; state.activeProject = null; renderMessages([]); updateChatHead(null); }
    renderRailCases(); renderCaseList(); renderDashboard(); updateColCounts();
  }
  function connectSSE() {
    const events = new EventSource('api/events');
    events.addEventListener('hello', () => refreshBoard(false));
    events.addEventListener('project.updated', (event) => { updateCard(JSON.parse(event.data).project); scheduleRefresh(); });
    events.addEventListener('project.created', (event) => { const card = JSON.parse(event.data).project; state.cards.set(card.id, card); renderRailCases(); renderCaseList(); scheduleRefresh(); });
    events.addEventListener('project.deleted', (event) => { removeCard(JSON.parse(event.data).projectId); scheduleRefresh(); });
    events.addEventListener('feed', (event) => { state.feed.unshift(JSON.parse(event.data).entry); state.feed = state.feed.slice(0, 100); renderFeed(); renderDashboardFeed(); });
    events.addEventListener('stats', (event) => { state.stats = JSON.parse(event.data); renderMetrics(); });
    events.onerror = () => {};
  }
  async function refreshBoard(loadInitialProject = true) {
    try {
      const board = await api('api/board');
      state.columns = board.columns; state.cards = new Map(board.projects.map((card) => [card.id, card])); state.feed = board.feed; state.stats = board.stats; state.schedule = board.schedule || []; state.reminders = board.reminders || [];
      renderBoard(); renderRailCases(); renderCaseList(); renderDashboard(); renderFeed();
      if (state.activeProjectId && !state.cards.has(state.activeProjectId)) { state.activeProjectId = null; state.activeProject = null; }
      if (loadInitialProject && !state.activeProjectId && state.cards.size) await loadChat(sortedCards()[0].id, false);
    } catch (error) { toast(error.message, 'err'); }
  }

  // ---------- bindings and init ----------
  function bind() {
    $$('.nav-item').forEach((button) => button.addEventListener('click', () => { switchView(button.dataset.view); if (button.dataset.view === 'assistant' && state.activeProject) initializeDshChat({ initialize: true }).catch((error) => toast(error.message, 'err')); }));
    $$('[data-view-jump]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.viewJump)));
    ['#btn-new-case', '#btn-new-case-mini', '#btn-new-case-side', '#btn-new-case-board'].forEach((selector) => $(selector).addEventListener('click', () => openNewProject(false)));
    $('#btn-new-iteration').addEventListener('click', () => openNewProject(true));
    $('#btn-open-ai').addEventListener('click', () => { switchView('assistant'); if (state.activeProject) initializeDshChat({ initialize: true }).catch((error) => toast(error.message, 'err')); });
    $('#btn-settings').addEventListener('click', openSettings);
    $('#btn-remote').addEventListener('click', openRemotePanel);
    $('#btn-pass-scene').addEventListener('click', showPassScene);
    $('#btn-collapse-rail').addEventListener('click', () => toggleLayoutPane('rail'));
    $('#btn-collapse-cases').addEventListener('click', () => toggleLayoutPane('cases'));
    $('#btn-collapse-context').addEventListener('click', () => toggleLayoutPane('context'));
    bindSplitter('#rail-resizer', 'rail', 1);
    bindSplitter('#case-resizer', 'cases', 1);
    bindSplitter('#context-resizer', 'context', -1);
    $('#global-search').addEventListener('click', () => { switchView('assistant'); $('#search').focus(); });
    $('#btn-case-detail').addEventListener('click', () => { if (state.activeProjectId) openDrawer(state.activeProjectId); });
    $('#btn-case-workspace').addEventListener('click', () => { if (state.activeProjectId) openWorkspace(state.activeProjectId); });
    $('#btn-assistant-policy').addEventListener('click', () => openAssistantPolicy());
    $('#btn-dsh-capabilities').addEventListener('click', openDshCapabilities);
    $('#btn-close-drawer').addEventListener('click', closeDrawer); $('#drawer-backdrop').addEventListener('click', closeDrawer);
    $('#btn-drawer-chat').addEventListener('click', () => { if (!state.drawerProject) return; const id = state.drawerProject.id; closeDrawer(); openProject(id); });
    $('#btn-drawer-folder').addEventListener('click', () => { if (state.drawerProject) openWorkspace(state.drawerProject.id); });
    $('#btn-send').addEventListener('click', sendMessage); $('#btn-stop').addEventListener('click', stopChat);
    $('#chat-input').addEventListener('input', () => { autoGrow($('#chat-input')); renderSlashSuggestions(); });
    $('#chat-input').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } });
    $('#chat-model').addEventListener('change', async () => {
      if (!state.activeProjectId) return;
      try {
        const selected = parseDshModelValue($('#chat-model').value);
        if (!selected) return;
        const result = await dshRpc('session.selectModel', { sessionId: state.dsh.sessionId, provider: selected.provider, model: selected.model });
        state.dsh.models.current = result.selected; populateDshModelSelect(state.dsh.models); updateDshChrome(); toast(`DSH 模型：${result.selected.model}`, 'ok');
      } catch (error) { toast(error.message, 'err'); }
    });
    $('#search').addEventListener('input', (event) => { state.search = event.target.value; renderCaseList(); });
    $$('.case-filter button').forEach((button) => button.addEventListener('click', () => { state.caseFilter = button.dataset.caseFilter; $$('.case-filter button').forEach((el) => el.classList.toggle('active', el === button)); renderCaseList(); }));
    $('#cal-prev-mini').addEventListener('click', () => moveMonth(-1)); $('#cal-next-mini').addEventListener('click', () => moveMonth(1)); $('#cal-today-mini').addEventListener('click', goToday);
    $('#cal-prev').addEventListener('click', () => moveMonth(-1)); $('#cal-next').addEventListener('click', () => moveMonth(1)); $('#cal-today').addEventListener('click', goToday);
    $('#cal-year').addEventListener('change', () => { state.calendarCursor = new Date(Number($('#cal-year').value), state.calendarCursor.getMonth(), 1); renderCalendars(); });
    $('#cal-month').addEventListener('change', () => { state.calendarCursor = new Date(state.calendarCursor.getFullYear(), Number($('#cal-month').value), 1); renderCalendars(); });
    $('#cal-date-jump').addEventListener('change', () => { if ($('#cal-date-jump').value) selectCalendarDate($('#cal-date-jump').value); });
    $('#btn-add-schedule').addEventListener('click', () => openScheduleModal(state.selectedDate));
    $('#btn-add-selected').addEventListener('click', () => openScheduleModal(state.selectedDate));
    document.addEventListener('click', (event) => { if (!event.target.closest('.composer-wrap')) $('#slash-suggestions').classList.add('hidden'); });
    document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); switchView('assistant'); $('#search').focus(); } if (event.key === 'Escape') { closeModal(); closeDrawer(); $('#slash-suggestions').classList.add('hidden'); } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshBoard(false); });
  }
  async function init() {
    applyTheme(localStorage.getItem('dsh-qa-theme') || 'dashboard', false);
    loadLayout();
    bind();
    populateDshModelSelect(null);
    updateDshChrome();
    if (state.dshEmbedded) {
      getQaPreset().catch((error) => { $('#service-status').classList.add('offline'); $('#service-status span').textContent = '测试模式缺失'; toast(error.message, 'err'); });
      refreshRemoteStatus(true);
    } else updateRemoteBadge();
    if (!location.search.includes('nosse')) connectSSE();
    await refreshBoard(true);
    switchView('dashboard');
  }
  init();
})();
