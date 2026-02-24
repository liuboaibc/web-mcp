# Legacy Retrofit Prompt 文档

## 目标

本文件用于沉淀一套可直接在 Cursor 使用的改造提示词，帮助你将历史 Web 项目快速改造成 Web-native MCP 形态：

- AI 直接调用页面内业务方法（method invocation）
- 不再依赖脆弱的 UI 点击自动化
- 支持增量改造与可回滚上线

## 推荐主 Prompt（完整改造版）

将下面整段复制到 Cursor Agent：

```text
你是一名“Web-native MCP 历史项目改造专家”，请在当前仓库内执行一次可落地、可回滚、可验证的改造任务。

【目标】
把历史项目从“AI 通过页面点击/表单自动化驱动”改造成“AI 通过 MCP 直接调用页面内业务方法（method invocation）”。
必须支持增量改造，优先保证现有业务行为不回归。

【关键原则（必须遵守）】
1. 禁止把“模拟点击/视觉定位”作为主路径；主路径必须是业务方法直调。
2. 优先复用现有架构边界：协议层、MCP server 层、页面 runtime 层、适配层。
3. 默认安全策略必须开启：鉴权、方法白名单、会话选择、限流、审计。
4. 组件卸载必须有清理能力：unmount/dispose 后调用应安全失败，不得悬空。
5. 全程增量改造：先只读方法，再逐步开放写方法。
6. 若信息不足，只提 1-2 个关键问题；否则按“安全默认值”继续推进。

【输入变量】
- PROJECT_TYPE: {{react|vue|vanilla|mixed}}
- ENTRY_FILES: {{逗号分隔，例如 src/main.ts, src/App.vue}}
- METHOD_CANDIDATES: {{候选业务方法列表，形如 user.getById, order.create}}
- SECURITY_LEVEL: {{strict|balanced|poc}}
- PREFERRED_MODE: {{sdk|extension|hybrid}}
- MCP_SERVER_ENTRY: {{例如 server/mcp.ts，未知则自动发现}}
- CONSTRAINTS: {{例如 不改动现有路由、不引入后端新接口}}

【执行步骤（按顺序）】
Step 1. 代码盘点
- 识别项目类型、入口文件、状态管理/服务层、全局对象、可暴露业务方法候选。
- 输出“方法候选清单”：按 readonly / mutating 分组，标注参数与返回值。

Step 2. 接入路径决策（SDK vs Extension）
- 给出决策理由与代价：侵入性、安全性、上线速度、可维护性。
- 若 PREFERRED_MODE=hybrid，则先落 SDK 主路径，再补 extension 兼容桥。

Step 3. 协议与工具对齐
- MCP 侧至少提供：
  - listPageMethods
  - invokePageMethod
- 页面侧必须有：
  - exposeMethods/registerMethod
  - unexpose/unregister 或 disposer
  - subscribe/emit event（若项目有事件需求）
- 输出方法命名规范：namespace.method，避免冲突。

Step 4. 安全与治理落地
- 开启并配置：
  - 鉴权 token（优先 websocket subprotocol）
  - allowed origins
  - method allowlist
  - 多会话显式 session 选择策略
  - 限流（每方法/每会话）
  - mutating 方法默认不重试（除非显式允许）
- 审计日志至少包含：traceId、method、sessionId、status、duration。

Step 5. 生命周期与可靠性
- 组件 mounted 时注册方法，unmounted 时 disposer 清理。
- 断线重连 + 发送队列（若已有则验证并补测试）。
- 旧方法被清理后，再调用应返回 METHOD_NOT_FOUND 等预期错误。

Step 6. 测试与验证
- 至少给出以下验证：
  1) listPageMethods 能发现方法
  2) invokePageMethod 能成功调用 3 个真实业务方法（建议 2 读 1 写）
  3) 组件卸载后方法不可调用
  4) 安全策略生效（allowlist/限流/会话）
- 补充最小回归测试，避免改坏旧逻辑。

Step 7. 文档与交付
- 更新/新增：
  - 改造说明（做了什么、为什么）
  - 运行说明（环境变量、启动步骤）
  - 风险与回滚步骤
- 最终输出格式必须包含：
  A. 改动文件列表（按模块分组）
  B. 关键设计决策
  C. 验证结果
  D. 风险清单
  E. 回滚方案
  F. 后续迭代建议（优先级 P0/P1/P2）

【验收标准（必须全部满足）】
- AI 能通过 MCP 发现方法并直接调用业务方法。
- 不依赖 UI 点击作为主路径。
- 卸载清理后无悬空方法调用问题。
- 安全治理策略已启用且可验证。
- 交付可复制到另一个历史项目，最多只需改变量配置与入口路径。

现在开始执行：先输出“改造前盘点结果”和“实施计划”，再逐步落地改造。
```

## 快速版 Prompt（PoC）

```text
请把当前历史 Web 项目快速改造成 Web-native MCP PoC，要求 AI 通过方法调用而非点击驱动页面。

约束：
1) 必须提供 listPageMethods + invokePageMethod。
2) 页面侧必须支持 exposeMethods 和 unmount 清理（disposer/unregister）。
3) 默认开启：method allowlist、session 显式选择、写方法不重试、限流。
4) 优先 SDK 模式；若侵入成本高则补 extension 兼容桥。
5) 产出最小可运行结果：2个只读方法 + 1个写方法可调用。

交付：
- 改动文件清单
- 启动与验证步骤
- 4条验证结果（发现方法/调用成功/卸载后失败/策略生效）
- 风险与回滚说明
```

## 项目变量模板

```yaml
PROJECT_TYPE: react
ENTRY_FILES:
  - src/main.tsx
  - src/App.tsx

METHOD_CANDIDATES:
  readonly:
    - user.getById
    - order.list
  mutating:
    - cart.addItem

PREFERRED_MODE: hybrid
SECURITY_LEVEL: strict

MCP_SERVER_ENTRY: server/mcp.ts
CONSTRAINTS:
  - 不修改现有业务接口返回结构
  - 不影响现有页面路由
  - 不引入后端新依赖
```

## 在 Cursor 中如何使用

1. 先填写“项目变量模板”。
2. 将“推荐主 Prompt”完整粘贴到 Cursor Agent。
3. 先让 Agent 输出“盘点结果 + 实施计划”，确认后再执行改造。
4. 执行完成后，要求按固定交付结构输出：文件清单、验证结果、风险、回滚。

## React / Vue / Vanilla 调优建议

- React：优先 `useEffect` 注册方法，并在 cleanup 调用 disposer。
- Vue：优先 `onMounted`/`onBeforeUnmount` 管理方法生命周期。
- Vanilla：优先封装 `window.legacyApi` 再映射，降低改动面。
- 所有项目建议先开放 `readonly.*`，再逐步开放写方法。

## 备注

本仓库目标是 Web-native MCP 改造范式验证。执行改造时，仍需结合真实业务的权限模型、审计要求和发布流程进行二次审查。
