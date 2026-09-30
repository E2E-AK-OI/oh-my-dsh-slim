# oh-my-dsh-slim

在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）中复刻
[oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) 的 subagent 角色委派体系：
**orchestrator + 5 个专职角色**，每个角色有独立 persona、模型、工具权限（toolFilter）、思考强度
（reasoningEffort）与 MCP 访问。交付物是一个**声明式 DSH agent 预设**——直接从插件组合包里挂载，
既不是独立应用，也不需要你手工拷贝任何目录。

> Persona 文本适配自 oh-my-opencode-slim（MIT © 2025 alvinunreal），保留署名——详见
> [LICENSE](./LICENSE)。English version: [README.md](./README.md)。

> **⚠️ DSH 版本支持（0.6.0）**：**DSH 0.2.0-rc.2**，已端到端实测。DSH 0.2.0 把 agent preset 改成了
> **声明式**——本包改为从自己的组合包补丁里声明预设，宿主的 `$DSH_HOME/.agent-presets/` 目录模型
> 已彻底消失。**0.6.0 需要 DSH ≥ 0.2.0-rc.2，DSH 0.2.0 需要 0.6.0。**
>
> 还留在旧宿主上？请对齐版本：**DSH ≤ 0.1.5-rc.2** 请用 oh-my-dsh-slim **0.5.3**（目录式预设线）。
> **0.1.6～0.1.x 线**虽然也已用组合包补丁声明预设，但缺少本预设依赖的那几个接缝，同样不受支持——
> 请把宿主升级到 DSH 0.2.0-rc.2。
>
> **升级后必须重启 DSH**：插件代码（工具 schema、工具描述、注入的提醒字符串）每宿主进程只挂载
> 一次，仅开新会话跑的仍是旧代码。

## 它解决什么问题

DSH 的默认编排是「一个模型包打天下」。本预设把工作拆成专职车道，orchestrator 只负责规划、派发与
整合：

- **oracle**（战略顾问）：架构决策、复杂排障、代码评审——只读
- **designer**（前端设计）：UI/UX 与视觉打磨——可写
- **fixer**（快速实现）：规格明确的机械实现——可写
- **explorer**（代码检索）：快速结构勘察——只读
- **librarian**（外部调研）：官方文档/GitHub 检索（context7 + gh_grep MCP）——只读

派发默认走**后台**（continuable）：orchestrator 派完即结束回合，子代理完成时由运行时通知唤醒整合。
orchestrator 遵循严格的委派纪律——派发完独立车道后以简短状态说明结束回合（不轮询、不在同一回合
重做运行中车道的 scope 内工作），把车道的中间回报视为「尚未结算」，只在 finish 通知后收口；
`subagent_result` 工具可只读取回已结束子代理的最终消息（不唤醒、零额外模型轮次）。

## 角色矩阵

| 角色 | 工具名 | 默认模型 | 默认 effort | 权限 |
|---|---|---|---|---|
| oracle | subagent_oracle | deepseek-v4-pro | max | 只读 |
| designer | subagent_designer | deepseek-flash | high | 可写 |
| fixer | subagent_fixer | deepseek-flash | high | 可写 |
| explorer | subagent_explorer | deepseek-flash | low | 只读 |
| librarian | subagent_librarian | deepseek-flash | high | 只读 + MCP |

- 所有角色继承全局工具；只读角色 deny `edit`/`write`；全部角色 deny 控制类工具（`skill`、
  `job_kill`、`job_list`、`job_output`、`todo_write`、`ask_user_question`）——OMO 风格 deny-only
- 角色禁止再委派（`maxDepth: 1`）；只有 librarian 挂载配置里给它声明的 MCP 服务器
- **observer（视觉分析）本版本预留但强制关闭**：DSH 的发送门控按主模型视觉能力拦截图片附件，
  且委派提示词是纯文本，粘贴图无法交接给子代理。等上游支持「消息附件转发进子代理」后开放

## 安装

需要 **DSH 0.2.0-rc.2** 与 DeepSeek API key（随包分发的角色模型走 `deepseek-official`）。

**方式 A——CLI（推荐、也是官方支持的路径）：**

```bash
dsh plugin --profile <profile> add oh-my-dsh-slim
```

`dsh plugin` 是 pnpm 的薄包装：它把包装进 `$DSH_HOME/profiles/<profile>/`，并把该包**归并进这个
profile 的 `dsh.profile.bundles` 层列表**——正是这一步让加载器去读本包的组合包补丁。本地目录或
git 地址同样可用，因为底层就是 `pnpm add`：

```bash
dsh plugin --profile desktop add ./oh-my-dsh-slim              # 本地目录
dsh plugin --profile desktop add github:ninipa/oh-my-dsh-slim  # git 地址
```

然后**重启 DSH**，新建会话时在 **设置 → Agent 预设** 里选择「极简角色委派」。

**方式 B——插件市场 GUI：** 若你的 DSH 自带插件市场，打开 **设置 → 插件**，在市场里搜索
`oh-my-dsh-slim` 并安装；也可在
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 目录中找到。之后同样
需要重启 DSH。

- **更新**：`dsh plugin --profile <profile> add oh-my-dsh-slim@latest`，然后重启 DSH
- **卸载**：`dsh plugin --profile <profile> remove oh-my-dsh-slim`，然后重启 DSH。现在没有播种目录
  了——移除包即移除预设
- **回滚**：为旧宿主装回旧版本（`dsh plugin --profile <profile> add oh-my-dsh-slim@0.5.3` 可在
  DSH ≤ 0.1.5-rc.2 上恢复目录式预设线），然后重启 DSH

> ℹ️ 以上命令都使用 `$DSH_HOME`（默认 `~/.dsh`）。若你的部署使用自定义 home（桌面 App 用的是
> 隔离环境），请先设置 `DSH_HOME`。

## 预设是怎么声明的（0.2.0 模型）

DSH 0.2.0 没有预设目录。一个 **agent preset** 就是一行 `@deepseek-ai/dsh-agent-preset` 加载器行，
它的 `config.plugins` **就是**该预设的插件列表；而一个包通过随包分发**组合包补丁**来声明它：

- `cordis.patch.yml`（仓库根与 `npm-package/` 内各一份，内容一致）插入两行：
  `preset-oh-my-dsh-slim` → `preset/preset.js`，`omds-seeder` → `lib/index.js`
- `preset/preset.js` 注册
  `{ id: 'oh-my-dsh-slim', name: '极简角色委派', order: 20, plugins: [...] }`——共 19 条顶层行，
  覆盖六个角色工具、orchestrator persona、planning 与 compaction 行，以及一个 `delegation` 分组
- 五个包内行（`roles.js`、`subagent-result.js`、`subagent-roles.js`、`early-close-context.js`、
  `sandbox-strip.js`）一律用**由 `import.meta.url` 拼出的绝对 `file:` URL** 引用，绝不用相对路径：
  行名是相对**声明它的那份补丁文件**的 `baseUrl` 解析的，所以写 `./roles.js` 会被审计成
  「never started」并静默失效
- 两行是条件行：`tool-pwsh` 在非 Windows 上关闭，`tool-plugin-manager` 在 profile 没有
  `profileContext` 服务时关闭

`lib/index.js`（`omds-seeder`）是本包在 **profile 平面**的伴生行。它只做汇报：声明了哪个预设、
当前宿主版本与结论、注册了哪些角色工具，以及一行生效配置摘要。给该行挂 `{ verbose: true }` 还会
逐角色打印一行表。行内抛异常会连带整个预设挂载失败，所以这个探针刻意不会致命。

> 预设注册表「既不扫描目录也不接受预设路径」，因此不会向 `$DSH_HOME` 复制任何东西，卸载时也没有
> 残留可清。

## 配置

零配置即可使用——随包分发的默认值会跟着包走。用户配置按以下优先级读取；所有通道共用同一份文档
结构与同一条合并规则（**用户值逐键覆盖，数组整体替换**）：

1. `OH_MY_DSH_SLIM_CONFIG` 环境变量指向的文件（测试/CI 通道）
2. 挂载副本旁的 `profile.json`（每 profile 快照）
3. `$DSH_HOME/oh-my-dsh-slim.json`（面向用户的配置文件）
4. 随包分发的 `defaults.json`（最低优先级层，始终存在）

```json
{
  "preset": "my-dsh-normal",
  "mcpServers": {
    "context7": { "transport": "streamable-http", "url": "https://mcp.context7.com/mcp" },
    "gh_grep": { "transport": "streamable-http", "url": "https://mcp.grep.app" }
  },
  "presets": {
    "my-dsh-normal": {
      "fixer": { "model": "deepseek-flash", "effort": "high" },
      "librarian": { "mcps": ["context7", "gh_grep"] }
    }
  }
}
```

也接受紧凑的 `roles` 映射，它的优先级高于 `presets[<name>]`：

```json
{
  "preset": "my-dsh-normal",
  "roles": {
    "oracle": { "model": "deepseek-v4-pro", "effort": "max" },
    "explorer": { "enabled": false }
  }
}
```

- 可按角色覆盖的键：`enabled`、`provider`、`model`、`effort`、`temperature`、`maxTokens`、
  `tools`、`deny`、`mcps`。`tools` 是穷举白名单（`tools.restrict()` 语义）；空数组等于「未配置」，
  非空数组里的名字必须是已知全局工具。`advanced.roles.<roleId>` 最后合并，压在所有通道之上
- **思考强度只校验形状，不校验词表。** 随包分发的词表是 `off`/`low`/`high`/`max`，但档位 id 由各
  适配器自己定义、集合开放，所以任何形状合法的 token（首字母开头，后接字母/数字/`-`/`_`）都会被
  接受，且换到另一台机器依然合法。某个模型是否真的支持该档位，在委派时由 `omds-subagent-roles`
  询问 `llm.resolveModelInfo` 回答：不支持就报出可读错误，并列出该模型声明的档位与其适配器默认值。
  `none` 不是 token——角色不写 `effort` 就单纯继承宿主解析出的值
- **模型名校验发生在委派时**：不存在的 provider/model 由宿主如实报错，不会被静默忽略
- 配置读不出来或非法**从不致命**——行会打一条警告，然后放任宿主默认值生效
- **observer 锁定**：`observer.enabled: true` 会被忽略并警告（原因见角色矩阵）
- `model` / `maxTokens` / `tools` / `deny` / `mcps` 在预设挂载时读取（每会话一次）；而 `effort` 与
  `temperature` 在**每一次**委派请求时重新读取——所以在已经跑着的会话里，这两个键下一次委派就生效

**对话式配置**（无需手编 JSON）：在会话里直接说，例如「把 fixer 的模型换成 deepseek-v4-pro」或
「关闭 oracle 角色」——主模型会替你改配置文档。

## 自检

```bash
npm test
```

即 `node --test test/package.test.mjs`——八项结构性测试，不需要安装 DSH，零费用：

- 两份组合包补丁的每一行 id 与字段完全一致
- 补丁只声明**一个** `@deepseek-ai/dsh-agent-preset` 行，且指向 `preset/preset.js`
- **任何预设行都不得使用相对路径**——这是上面那个「never started」故障的回归护栏；每个包内行都
  解析到 `npm-package/preset/` 下真实存在的绝对 `file:` URL，且不是 YAML
- 六个角色行通过共享的 `roles.js` URL 被找到，persona 经 `composeRolePersona` → `roleIdFromEvents`
  往返一致，且各自广播自己的 `toolName`
- 角色包装器声明了被委派宿主实现需要的五项服务，交还的 stock 形状 config 保留 `toolName` 与
  persona、且不泄漏 `definition`
- 即便**完全没有**用户配置文件，随包的 `defaults.json` 也能抵达每个角色
- **部分**用户覆盖不会抹掉随包分发的 `provider`、`effort`、`deny` 与 `maxTokens`
- 每个角色都把自己那套路由（`provider`/`model`/`reasoningEffort`/`maxTokens`/`toolFilter`）带进宿主
  的 `agentOptions`

## 已知边界

- **升级后需要重启 DSH**：插件组合**每宿主进程只挂载一次**——配置值每会话重新解析，但插件代码
  （工具 schema、工具描述、注入字符串）冻结在进程内。升级插件后必须重启 DSH；仅开新会话跑的仍是
  旧代码
- **非 vision 主模型无法接收粘贴图片**：DSH 在发送时按主模型能力硬拦
  （`MODEL_DOES_NOT_SUPPORT_IMAGES`）。需要图片分析请换 vision 主模型直读，或等上游支持附件转发。
  若你的模型实际支持图像但仍被拦截，检查 provider 配置中该模型是否声明了图像输入能力
  （`input: ["text", "image"]`）——第三方 GPT 类模型常见此缺漏
- **web_search 走独立计费**：librarian 优先使用 MCP（免费通道）；web_search 由宿主搜索服务承担，
  每次调用产生一次独立的辅助模型请求，开放式调研任务建议在提示词中给出搜索预算
- **委派子代理无法升级沙箱权限——预设会剥离多余升级字段（`sandbox-strip` 插件，属 workaround）**：
  DSH 在启动时固定了子代理的文件策略与审批状态，但 `bash`/`edit`/`write` 工具 schema 仍暴露可选的
  `sandbox_permissions`/`justification` 字段；部分模型会无意识地填上这些字段，而子代理本就无法升级，
  多余参数只会触发参数校验错误（`invalid justification`、`not strictly wider`）。随预设分发的
  `sandbox-strip` 插件会在 `tools/pre-execute` 阶段移除角色子代理调用中的这两个字段，并在结果末尾
  附加 `[sandbox: stripped ...]` 提示让模型看到修正。在本预设自己的**顶层会话**中，它还会剥离
  那些在任何审批前都必然被拒的形态（空 justification、单字段配对、非更宽模式——用宿主同一张
  `WIDER_MODES` 表判定）；**合法升级请求（更宽模式 + 非空理由）保留，照常请求批准**。不使用本
  预设的会话不会加载该插件，行为零变化。这是预设层的临时缓解而非根治：真正修复在上游——DSH
  不应向权限已固定的子代理暴露升级字段
- **后台子代理与「提前收口」（`early-close-context` 插件）**：DSH 是回合制——模型要么输出要么
  结束回合，机制层面无法强制等待后台子代理；部分模型会在子代理仍在运行时输出最终结论（谎称
  「已完成」而未整合子代理结果）。随预设分发的 `early-close-context` 插件用**事实供给**缓解：
  system prompt 每回合注入「当前运行中的后台子代理」块（与宿主 `sandbox:policy` 同一动态机制）、
  每次派发成功的结果附加「Decision point」提醒、persona 增加「子代理未 settle 前不得声称完成」
  条款。账本三态（`running` → `reported` → `settled`）：子代理的中间回报（宿主句式
  「Agent <id> sent a message:」）被明确标注为「已回报内容，等待正式完成通知（reported ≠ 完成）」，
  只有 finish 通知才算结算。模型仍可能在子代理完成前结束回合（无强制等待），但不再谎报完成——
  settle 通知会唤醒主模型整合结果
- **MCP 服务器只是被声明，没有挂进子代理**：0.2.0 的委派工具不向子代理传 `childCtx`，所以角色的
  `mcps` 列表由配置与 librarian 的 persona 承载，而不是由 per-child 的 MCP scope 承载。librarian
  依然可用——它的 persona 会把它指向 context7/gh_grep，能用的工具就是会话本来有的那些

## FAQ

**需要哪个 API key？**
DeepSeek API key——随包分发的角色模型走 `deepseek-official`。角色也可以指向你在「设置-模型」里
导入的任意 provider。

**每个角色能用不同模型吗？**
可以——每个角色的 provider、模型、思考强度与温度都可通过上面的 JSON 通道（或对话）配置。模型名
写错会在第一次委派时明确报错，而不是静默降级。

**怎么卸载？**
`dsh plugin --profile <profile> remove oh-my-dsh-slim`，然后重启 DSH。没有任何东西被复制进
`$DSH_HOME`，所以没有残留目录要清。

**能在 DSH 0.1.x 上用吗？**
不能。DSH 0.1.x 没有声明式预设接缝。DSH ≤ 0.1.5-rc.2 请用 oh-my-dsh-slim 0.5.3；0.1.6～0.1.x
线请把宿主升级到 0.2.0-rc.2。

**图片分析？**
换一个 vision 主模型直接粘贴。observer 角色要等宿主能把附件转发进子代理上下文后才开放。

## 即将发布（Roadmap）

- **observer 重新启用**——等上游 DSH 支持「消息附件转发进子代理」（见角色矩阵中的说明）
- **per-role MCP 投递**——等委派接缝提供 `childCtx`（或等价物），让子代理能拿到自己的 MCP scope

## Changelog

见 [CHANGELOG.md](./CHANGELOG.md)。

## 致谢

- [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim)（MIT © 2025
  alvinunreal）——角色体系与 persona 来源
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)——宿主平台

## License

[MIT](./LICENSE)
