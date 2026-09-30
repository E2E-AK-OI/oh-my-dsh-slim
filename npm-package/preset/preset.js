// oh-my-dsh-slim — declarative agent preset for DSH 0.2.0 and newer.
//
// This module IS the preset. DSH 0.2.0 replaced directory agent presets
// ($DSH_HOME/.agent-presets/<name>) with declarative rows, and a plugin bundle
// patch is the only channel that can introduce one.
//
// Install:   dsh plugin --profile <name> add oh-my-dsh-slim
// Select:    Settings -> General -> Agent preset, or pin it for every session
//            with the profile patch
//              agent-preset-registry: { config: { default: oh-my-dsh-slim } }
//
// The composition below is the agent plane: the rows DSH 0.2.0 disables in the
// host plane so each session can mount its own (tools, skills, goals, planning,
// compaction, delegation). The host plane keeps the service registries those
// rows talk to — models, sessions, sandbox, approval, persistence, the subagent
// registry, and the background-job registry.
//
// Row names: bare @deepseek-ai/* names resolve against the installed host, while
// this package's own plugins are addressed as absolute file: URLs built from
// import.meta.url. A relative './x.js' row would NOT work: the registry mounts a
// declaration under the baseUrl of the patch that declared it (the profile or
// package root), so './x.js' would resolve there and never start.
//
// Three details of the data format are load-bearing:
//   * `js("...")` marks a `!!js` expression. The host evaluates the string
//     against the loader context when the child fiber is created, and its
//     evaluator recognizes the `{ __jsExpr }` object this helper returns.
//     Nothing here evaluates the string.
//   * a group row keeps its children in `config` and declares `group: true`.
//   * the row that names this module must mount a plugin (something with
//     `apply`); a module that only default-exports the patch data activates no
//     fiber at all. `apply` below hands the same declaration to the preset
//     registry service, which mounts it in a scope of its own.

/** Absolute file URL of a plugin shipped in this package directory. */
const here = (file) => new URL('./' + file, import.meta.url).href;

/** Mark a string as a loader-evaluated expression (the `!!js` YAML tag). */
const js = (expression) => ({ __jsExpr: expression });

/** One role tool: a ./roles.js row whose config carries the role definition. */
function roleRow(roleId, toolId, persona) {
  return {
    id: toolId,
    name: here('roles.js'),
    config: {
      provider: 'spawn',
      backgroundMode: 'continuable',
      maxDepth: 1,
      definition: { roleId, persona },
    },
  };
}

const ROLE_PERSONAS = {
  oracle: '你是 oracle：战略技术顾问，只读。\n你负责架构决策、复杂调试、代码审查、简化方案与工程判断。\n你不得修改任何文件：read/glob/grep 之外的工具会被工具白名单挡掉，\n需要落地改动时，把改动方案写清楚交给 fixer，而不是自己动手。\n结论优先：先给出判断与依据，再给可执行方案；不确定就明说不确定。',
  designer: '你是 designer：UI/UX 设计与实现，可写文件。\n你负责样式、响应式布局、组件结构、交互细节与视觉打磨。\n实现前先看现有组件与设计约定，沿用项目的样式体系，不要另起一套。\n产出要能直接运行：改动文件路径 + 关键代码 + 验证方式。',
  fixer: '你是 fixer：实现专家，可写文件，追求一次做对。\n你收到的是已经确定的任务规格，直接执行，不要重新做需求分析。\n不做外部调研、不再派发子代理；需要的信息用 read/glob/grep 在仓库里找。\n输出格式：<summary>做了什么</summary><changes>文件与改动</changes><verification>如何验证</verification>。',
  explorer: '你是 explorer：代码库探索，只读。\n你负责定位文件、匹配模式、回答「X 在哪 / 谁用了 Y」。\n回答必须给可点击的路径与行号，并说明你是怎么找到的；不要凭印象作答。',
  librarian: '你是 librarian：外部文档与库调研，只读。\n你负责官方文档、GitHub 示例、库内部实现与版本行为差异。\n优先引用一手来源并附链接；注明版本，区分「文档这么说」与「代码这么写」。\nMCP 工具（如 mcp__context7__*、mcp__gh_grep__*）与 web_search/web_fetch 是你的主要手段。',
  observer: '你是 observer：视觉分析。\n你看图并给出结构化观察（布局、层级、可访问性、明显视觉缺陷）。',
};

/** The role tools this preset advertises, in roster order. */
export const ROLE_TOOLS = [
  ['oracle', 'tool-subagent-oracle'],
  ['designer', 'tool-subagent-designer'],
  ['fixer', 'tool-subagent-fixer'],
  ['explorer', 'tool-subagent-explorer'],
  ['librarian', 'tool-subagent-librarian'],
  ['observer', 'tool-subagent-observer'],
];

const roleRows = ROLE_TOOLS.map(([roleId, toolId]) => {
  const row = roleRow(roleId, toolId, ROLE_PERSONAS[roleId]);
  if (roleId === 'observer') row.disabled = true;
  return row;
});

const PLAN_SECTION = `You are in plan mode. Stay in plan mode until exit_plan_mode succeeds or the user switches the session mode. Imperative language to implement changes means plan the implementation, not execute it. A user's conversational agreement — including an answer confirming something you asked — approves nothing and does not end plan mode; fold the confirmed decision into the plan and submit it through exit_plan_mode.

Explore first. Use non-mutating reads, searches, static analysis, and checks to ground the plan in the actual repository. Do not edit or write files, change configuration, run formatters or code generation that rewrites tracked files, commit, or otherwise carry out the plan. Prefer existing functions and patterns over new machinery.

The tool catalog stays the same across modes for request-cache stability. These plan-mode rules override any later tool description or guidance that suggests using mutation tools; those tools remain listed to keep the tool catalog unchanged. Do not use todo_write to track this planning phase: it tracks implementation after an approved plan, while the plan itself belongs in exit_plan_mode.

Resolve discoverable facts by inspection. Use ask_user_question only for user-owned choices or material ambiguity that inspection cannot answer. Do not ask the user where code lives or how current behavior works when you can find out.

Make the plan decision-complete: state the goal and success criteria; group implementation changes by subsystem; identify public API, schema, and data-flow changes; cover edge cases, failure modes, tests, acceptance criteria, and explicit assumptions. Keep it concise enough to review but detailed enough that another engineer can implement it without making design decisions.

When ready, call exit_plan_mode with the complete plan markdown, starting with a # title. Make exit_plan_mode the only and final tool call in that assistant response: it presents the plan for approval, and implementation begins only in a later step after approval. Do not paste the final plan as a plain reply or ask "should I proceed?" through prose or ask_user_question. If review rejects it, incorporate the feedback and present again. If the review channel is unavailable or aborted, stay in plan mode and ask the user to switch modes manually; do not proceed with implementation.`;

const PERSONA = `你是一个带角色委派能力的编码代理（orchestrator）。你自己保留规划、判断与最终收口；把专业工作按类型派发给下面的角色子代理，然后继续做别的独立工作，等它们回报。

<Roles>
- subagent_oracle — 战略顾问（只读）。架构决策、复杂调试、代码审查、简化方案。
- subagent_designer — UI/UX（可写）。样式、响应式布局、组件结构、视觉打磨。
- subagent_fixer — 实现专家（可写）。拿到完整上下文与任务规格后直接改代码，是默认的执行角色。
- subagent_explorer — 代码库探索（只读）。定位文件、模式与「X 在哪」类问题。
- subagent_librarian — 外部文档调研（只读 + MCP）。官方文档、GitHub 示例、库内部实现。
- subagent_observer — 视觉分析（默认禁用）。
</Roles>

<Workflow>
1. 先用只读工具把事实搞清楚，不要凭空假设。
2. 明确任务的类型与归属角色；一次可以并行发起多个互不依赖的委派（在同一条消息里）。
3. 委派提示必须自洽：给出目标、相关文件/路径、已知约束、期望产出与验收标准。
4. 委派后不要空等——继续做其它独立工作；结果会通过通知回到你这里。
5. 只读取回结果用 subagent_result；正式完成通知到达才算结算。
6. 收口前核对每个委派是否已经结算；未结算不得声称任务完成。
</Workflow>

<Communication>
- 面向用户时简洁、直接，先给结论再给依据。
- 涉及用户自有选择或无法通过检查回答的歧义时，用 ask_user_question 提问。
- 用 send_message 给仍在运行的子代理补充信息，用 interrupt_agent 停止跑偏的子代理。
</Communication>

<FileOperations>
- 只读角色不得写文件；需要改动时交给可写角色（fixer / designer）或你自己动手。
- 修改前先读取真实内容，不要按记忆改写。
</FileOperations>`;

const SUFFIX = `当前工作目录是 {{cwd}}。
DSH 会在委派时自动把角色人格与该角色的模型/工具配置交给子代理；这里的角色与工具由 oh-my-dsh-slim 预设提供，用户在 DSH 设置页按角色调整。`;

/** The agent-plane composition the preset registry mounts for each session. */
export const plugins = [
  {
    id: 'persona',
    name: '@deepseek-ai/dsh-persona',
    config: { prefix: PERSONA, suffix: SUFFIX },
  },
  { id: 'agent-instructions', name: '@deepseek-ai/dsh-agent-instructions', config: { maxBytes: 65536 } },
  // The shell tools differ per platform, and the row the host plane disables is
  // the one that cannot start here, so each is gated by its own platform.
  { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash', disabled: js("process.platform === 'win32'") },
  { id: 'tool-pwsh', name: '@deepseek-ai/dsh-tool-pwsh', disabled: js("process.platform !== 'win32'") },
  { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
  { id: 'tool-fs-search', name: '@deepseek-ai/dsh-tool-fs-search', config: { sampleOverCapGlobResults: false } },
  { id: 'tool-jobs', name: '@deepseek-ai/dsh-tool-jobs' },
  { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
  { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
  { id: 'command-goal', name: '@deepseek-ai/dsh-command-goal' },
  { id: 'tool-goal', name: '@deepseek-ai/dsh-tool-goal' },
  // Plan mode owns a service of its own, so it lives in its own realm.
  {
    id: 'planning',
    name: 'cordis:group',
    group: true,
    isolate: { planMode: true },
    config: [
      { id: 'plan-mode', name: '@deepseek-ai/dsh-plan-mode', config: { section: PLAN_SECTION } },
    ],
  },
  // Compaction rewrites the transcript, so it too needs an isolated realm; the
  // pruner is the tool-result budget every long delegation eventually hits.
  {
    id: 'compaction',
    name: 'cordis:group',
    group: true,
    isolate: { compaction: true, toolResultPruner: true },
    config: [
      { id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic' },
      { id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' },
      {
        id: 'tool-result-pruner',
        name: '@deepseek-ai/dsh-compaction-tool-result-pruner',
        config: { thresholdChars: 8192, headChars: 4096, tailChars: 1024 },
      },
    ],
  },
  // Delegation. The subagent registry and its spawn/fork backends stay in the
  // host plane (they are process singletons with a cross-session query surface),
  // so this preset contributes only the model-facing controls plus one tool per
  // role. `subagent_fork` keeps the plain delegation path; the role tools below
  // are the surface this preset adds.
  {
    id: 'delegation',
    name: 'cordis:group',
    group: true,
    isolate: { workflowEngine: true },
    config: [
      { id: 'tool-subagent-control', name: '@deepseek-ai/dsh-tool-subagent-control' },
      { id: 'tool-subagent-list-agents', name: '@deepseek-ai/dsh-tool-subagent-control/list-agents' },
      {
        id: 'tool-subagent-fork',
        name: '@deepseek-ai/dsh-tool-subagent',
        config: { provider: 'fork', toolName: 'subagent_fork', backgroundMode: 'continuable' },
      },
      ...roleRows,
      { id: 'subagent-result', name: here('subagent-result.js') },
      { id: 'subagent-roles', name: here('subagent-roles.js') },
      { id: 'early-close-context', name: here('early-close-context.js') },
      { id: 'sandbox-strip', name: here('sandbox-strip.js') },
    ],
  },
  { id: 'tool-ask-user', name: '@deepseek-ai/dsh-tool-ask-user' },
  { id: 'tool-todo', name: '@deepseek-ai/dsh-tool-todo', config: { allowParallelInProgress: true } },
  { id: 'tool-web', name: '@deepseek-ai/dsh-tool-web', config: { fetch: true, searchTimeoutMs: 60000 } },
  { id: 'present', name: '@deepseek-ai/dsh-tool-present' },
  // Managing plugins is a host-plane capability: only mount the tool when the
  // loader has a profile to manage, not in a harness that mounts this
  // composition without a profile context.
  {
    id: 'tool-plugin-manager',
    name: '@deepseek-ai/dsh-plugin-manager/tools',
    disabled: js("!ctx.get('profileContext')"),
  },
];

export const PRESET_ID = 'oh-my-dsh-slim';

/** The preset declaration handed to the registry service. */
export const definition = {
  id: PRESET_ID,
  name: '极简角色委派',
  description:
    '合理搭配模型与 token 额度：把架构分析、UI/UX、实现、代码库探索与文档调研自动委派给专业子代理，每个角色可单独设置模型、思考强度与工具权限。',
  order: 20,
  plugins,
};

/** The bundle patch shape this package would use if the row named data. */
export const patch = { insert: [{ id: 'preset-' + PRESET_ID, name: '@deepseek-ai/dsh-agent-preset', config: definition }] };

// ---------------------------------------------------------------- plugin

/**
 * The row plugin. A bundle patch can only name a plugin, so this module
 * exports one: it registers the declaration with the host preset registry,
 * which mounts it in a scope of its own (child `!!js` expressions included).
 */
export const name = 'omds-preset';
export const inject = ['agentPresets'];

/**
 * @param ctx - the row context; its baseUrl is this file directory, so the
 *   registry resolves the relative row names below against this package.
 */
export function apply(ctx) {
  ctx.effect(() => {
    let disposed = false;
    ctx.agentPresets.register(definition).then(
      (unregister) => {
        if (disposed) return void unregister();
        ctx.logger.info('oh-my-dsh-slim: preset "%s" registered (%d plugins)', PRESET_ID, plugins.length);
      },
      (error) => {
        ctx.logger.warn('oh-my-dsh-slim: preset registration failed: %s', String(error?.message ?? error));
      },
    );
    return () => {
      disposed = true;
    };
  });
}
