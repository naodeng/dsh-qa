// 启动种子数据：首次运行创建示例测试项目/迭代，展示看板形态
import * as store from './store.js';

// 相对今天的日期偏移，保证示例数据始终有临期/逾期/未来三种状态
function dayOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function seedIfEmpty() {
  if (store.listProjects().length > 0) return;

  const p1 = store.createProject({
    kind: 'project',
    title: '【示例】电商中台订单服务 2026 上半年测试项目',
    projectKey: 'PRJ-2026-001',
    product: '电商中台 · 订单域',
    owner: '张测试',
    type: 'web',
    summary: '覆盖订单创建、支付回调、退款、库存扣减与对账的核心链路；含接口、性能与安全专项。',
    members: [
      { id: store.uid('member'), name: '张测试', role: 'owner', contact: 'zhang@example.com' },
      { id: store.uid('member'), name: '李开发', role: 'dev', contact: '' },
      { id: store.uid('member'), name: '王产品', role: 'pm', contact: '' },
    ],
  });
  p1.requirements = [
    { id: store.uid('req'), title: '订单创建（含幂等）', kind: 'functional', statement: '用户提交订单后生成唯一订单号，重复提交需幂等。', acceptance: '同一请求重复提交只生成一个订单', links: [], at: store.now() },
    { id: store.uid('req'), title: '支付回调处理', kind: 'functional', statement: '支付网关回调需验签并按订单状态流转。', acceptance: '验签失败拒绝处理并告警', links: [], at: store.now() },
    { id: store.uid('req'), title: '库存并发扣减', kind: 'nonfunctional', statement: '高并发下库存扣减不超卖，接口 P99 < 300ms。', acceptance: '并发 500 压测无超卖', links: [], at: store.now() },
  ];
  p1.testcases = [
    { id: store.uid('tc'), title: '正常提交订单生成订单号', kind: 'functional', priority: 'P0', preconditions: '已登录，商品有库存', steps: '1. 加入购物车\n2. 提交订单\n3. 查看订单列表', expected: '生成唯一订单号，状态为待支付', trace: 'R-001', risks: ['核心主流程'], status: 'draft', at: store.now() },
    { id: store.uid('tc'), title: '重复提交幂等校验', kind: 'boundary', priority: 'P1', preconditions: '网络可重复触发', steps: '1. 提交订单\n2. 立即重放同一请求', expected: '第二次请求返回同一订单号，不重复下单', trace: 'R-001', risks: ['幂等', '并发'], status: 'draft', at: store.now() },
    { id: store.uid('tc'), title: '支付回调验签失败', kind: 'security', priority: 'P1', preconditions: '可伪造回调请求', steps: '1. 构造非法签名回调\n2. 发送到回调接口', expected: '拒绝处理并记录告警', trace: 'R-002', risks: ['安全'], status: 'draft', at: store.now() },
    { id: store.uid('tc'), title: '库存并发压测不超卖', kind: 'performance', priority: 'P1', preconditions: '库存 100，压测工具就绪', steps: '1. 启动 500 并发\n2. 全部提交订单', expected: '成功下单数 ≤ 100，P99 < 300ms', trace: 'R-003', risks: ['高并发', '超卖'], status: 'draft', at: store.now() },
  ];
  p1.testcases[0].links = [];
  p1.requirements[0].links.push({ testcaseId: p1.testcases[0].id, purpose: '验证正常下单主流程', at: store.now() });
  p1.requirements[0].links.push({ testcaseId: p1.testcases[1].id, purpose: '验证幂等覆盖', at: store.now() });
  p1.requirements[1].links.push({ testcaseId: p1.testcases[2].id, purpose: '验证回调安全校验', at: store.now() });
  p1.defects = [
    { id: store.uid('bug'), title: '退款接口在并发场景偶发返回 500', severity: 'major', environment: 'staging v1.2.0', steps: '1. 并发发起 10 笔退款\n2. 观察响应', expected: '全部成功', actual: '偶发 500（约 5%）', module: '订单域-退款', frequency: '偶发（约 5%）', impact: '影响并发退款用户，需人工重试', status: 'open', at: store.now() },
  ];
  p1.milestones = [
    { id: store.uid('ms'), title: '用例评审会', kind: 'review', startDate: null, days: null, dueDate: dayOffset(3), basis: '测试计划排期', done: false, at: store.now() },
    { id: store.uid('ms'), title: '需求冻结', kind: 'freeze', startDate: dayOffset(-45), days: 30, dueDate: dayOffset(-15), basis: '产品排期', done: false, at: store.now() },
    { id: store.uid('ms'), title: '正式发布', kind: 'release', startDate: null, days: null, dueDate: dayOffset(21), basis: '发布排期', done: false, at: store.now() },
  ];
  p1.events = [
    { id: store.uid('evt'), title: '测试排期同步会', date: dayOffset(1), kind: 'meeting', note: '与产品、开发对齐排期', at: store.now() },
  ];
  p1.knowledge = [
    { id: store.uid('kn'), title: '幂等键设计最佳实践', source: '历史缺陷复盘', summary: '订单幂等需用 请求ID+用户ID 作为唯一键，且写入与查询必须在同一事务。', links: [], at: store.now() },
  ];
  p1.minutes = [
    { id: store.uid('min'), title: '测试范围确认会纪要', content: '确定覆盖订单创建/支付回调/退款/库存扣减/对账五条核心链路；性能压测安排在 staging 环境。', at: store.now() },
  ];
  p1.reports = [
    {
      id: store.uid('doc'), docType: 'test-plan', title: '电商中台订单服务测试计划', instructions: '', status: 'draft',
      versions: [{
        v: 1, at: store.now(), hash: 'demo',
        content: '一、测试范围：订单创建、支付回调、退款、库存扣减、对账。\n二、测试策略：功能 + 接口 + 性能压测（500 并发）+ 安全专项。\n三、里程碑：3/10 用例评审，4/1 正式发布。\n四、风险：退款并发 500 问题需在 3 月中旬前修复。',
      }],
      at: store.now(),
    },
  ];
  p1.gates = [
    { id: store.uid('gate'), type: 'testcase-review', title: '用例评审（订单主流程）', summary: '4 条 P0/P1 用例待评审，覆盖幂等与并发风险。', status: 'pending', requestedAt: store.now(), decidedAt: null, decision: null },
  ];
  store.transitionProject(p1, 'design', 'seed');
  p1.materials = [
    { id: store.uid('feed'), ts: store.now(), type: 'doc', label: '示例：测试计划草稿 v1 已保存' },
    { id: store.uid('feed'), ts: store.now(), type: 'evidence', label: '示例：登记用例 库存并发压测不超卖' },
    { id: store.uid('feed'), ts: store.now(), type: 'defect', label: '示例：登记缺陷 退款接口并发 500' },
  ];

  const p2 = store.createProject({
    kind: 'iteration',
    parentId: p1.id,
    title: '【示例】订单域 3 月迭代（v1.2.0）',
    projectKey: 'ITER-2026-0301',
    product: '电商中台 · 订单域',
    owner: '张测试',
    type: 'web',
    summary: '本期聚焦退款重构与对账补偿链路，属于主项目下的迭代。',
    members: [{ id: store.uid('member'), name: '张测试', role: 'owner', contact: '' }],
  });
  p2.requirements = [
    { id: store.uid('req'), title: '退款状态机重构', kind: 'functional', statement: '退款状态机支持 待处理/处理中/成功/失败/需人工介入 五态。', acceptance: '状态流转符合状态机定义', links: [], at: store.now() },
  ];
  p2.testcases = [
    { id: store.uid('tc'), title: '退款状态机全流转验证', kind: 'functional', priority: 'P0', preconditions: '存在一笔已支付订单', steps: '1. 发起退款\n2. 依次触发各状态', expected: '状态按状态机流转，非法流转被拒绝', status: 'draft', at: store.now() },
  ];
  p2.milestones = [
    { id: store.uid('ms'), title: '迭代发布', kind: 'release', startDate: null, days: null, dueDate: dayOffset(14), basis: '迭代排期', done: false, at: store.now() },
  ];
  store.transitionProject(p2, 'intake', 'seed');

  store.persist();
}
