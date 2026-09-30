# oh-my-dsh-slim

A port of [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim)'s specialist
subagent delegation for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH):
**an orchestrator + 5 specialist roles**, each with its own persona, model, tool permissions
(toolFilter), reasoning effort, and MCP access. Delivered as a **declarative DSH agent preset**
that mounts straight out of the plugin bundle — not a standalone application, and not a directory
you copy anywhere.

> Persona text adapted from oh-my-opencode-slim (MIT © 2025 alvinunreal), attribution retained —
> see [LICENSE](./LICENSE). 中文版见 [README.zh.md](./README.zh.md).

> **⚠️ DSH version support (0.6.0)**: **DSH 0.2.0-rc.2**, verified end to end. DSH 0.2.0 turned
> agent presets **declarative** — this package now declares its preset from its own bundle patch,
> and the `$DSH_HOME/.agent-presets/` directory model is gone from the host entirely. **0.6.0
> needs DSH ≥ 0.2.0-rc.2, and DSH 0.2.0 needs 0.6.0.**
>
> Staying on an older host? Match the lines: **DSH ≤ 0.1.5-rc.2** → oh-my-dsh-slim **0.5.3** (the
> directory-preset line). The **0.1.6–0.1.x** line already declares presets by bundle patch but
> predates the seams this preset uses, so it is not supported either — upgrade to DSH 0.2.0-rc.2.
>
> **Upgrading requires a DSH restart**: plugin code (tool schemas, tool descriptions, injected
> reminder strings) mounts once per host process, so new sessions alone still run the old code.

## What it solves

DSH's default orchestration is "one model does everything". This preset splits work into
specialist lanes, and the orchestrator plans, dispatches, and integrates:

- **oracle** — architecture decisions, complex debugging, code review. Read-only.
- **designer** — UI/UX design and visual polish. Writable.
- **fixer** — bounded mechanical implementation. Writable.
- **explorer** — fast codebase reconnaissance. Read-only.
- **librarian** — external research via official docs / GitHub (context7 + gh_grep MCP). Read-only.

Delegation is **background-first** (continuable): the orchestrator dispatches lanes and ends its
turn; the runtime wakes it with a settlement notice when a lane finishes, so it can integrate
results. The orchestrator follows a strict delegation discipline — after dispatching independent
lanes it ends its turn with a brief status note (no polling, no re-doing a running lane's scope
in the same turn), treats a lane's interim report as "not settled yet", and only finalizes on the
settlement notice. The `subagent_result` tool reads a finished subagent's final message **without
waking it** (zero extra model turns).

## Role matrix

| Role | Tool | Default model | Effort | Permissions |
|---|---|---|---|---|
| oracle | subagent_oracle | deepseek-v4-pro | max | read-only |
| designer | subagent_designer | deepseek-flash | high | writable |
| fixer | subagent_fixer | deepseek-flash | high | writable |
| explorer | subagent_explorer | deepseek-flash | low | read-only |
| librarian | subagent_librarian | deepseek-flash | high | read-only + MCP |

- All roles inherit the global tools; read-only roles deny `edit`/`write`; every role denies the
  control tools (`skill`, `job_kill`, `job_list`, `job_output`, `todo_write`,
  `ask_user_question`) — an OMO-style deny-only policy
- Roles cannot delegate further (`maxDepth: 1`); only librarian mounts the MCP servers it is
  configured with
- **observer (visual analysis) is reserved but force-disabled in this release**: DSH's send-time
  gate blocks image attachments based on the *main model's* vision capability, and delegation
  prompts are text-only, so pasted images cannot reach a subagent yet. It will be re-enabled when
  the harness supports forwarding message attachments into subagent contexts

## Install

Requires **DSH 0.2.0-rc.2** and a DeepSeek API key (the shipped role models route through
`deepseek-official`).

**Option A — CLI (the supported path):**

```bash
dsh plugin --profile <profile> add oh-my-dsh-slim
```

`dsh plugin` is a thin wrapper around pnpm: it installs the package into
`$DSH_HOME/profiles/<profile>/` and reconciles it into that profile's `dsh.profile.bundles` layer
list — which is what makes the loader read this package's bundle patch. A local checkout or a git
URL works just as well, because the underlying command is `pnpm add`:

```bash
dsh plugin --profile desktop add ./oh-my-dsh-slim              # local path
dsh plugin --profile desktop add github:ninipa/oh-my-dsh-slim  # git URL
```

Then **restart DSH** and pick **极简角色委派** in **Settings → Agent Presets** when you start a new
session.

**Option B — plugin marketplace GUI:** if your DSH ships the plugin marketplace, open
**Settings → Plugins**, search for `oh-my-dsh-slim`, and install. The plugin is also listed in the
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) catalog. Restart
DSH afterwards.

- **Update**: `dsh plugin --profile <profile> add oh-my-dsh-slim@latest`, then restart DSH
- **Uninstall**: `dsh plugin --profile <profile> remove oh-my-dsh-slim`, then restart DSH. There is
  no seeded directory any more — removing the package removes the preset
- **Rollback**: install the older package for the older host
  (`dsh plugin --profile <profile> add oh-my-dsh-slim@0.5.3` restores the directory-preset line
  for DSH ≤ 0.1.5-rc.2), then restart DSH

> ℹ️ Everything above uses `$DSH_HOME` (default `~/.dsh`). If your deployment uses a custom home
> (the desktop app uses an isolated one), set `DSH_HOME` before running the CLI.

## How the preset is declared (the 0.2.0 model)

DSH 0.2.0 has no preset directory. An **agent preset** is a loader row of
`@deepseek-ai/dsh-agent-preset` whose `config.plugins` **is** the preset's plugin list, and a
package declares one by shipping a **bundle patch**:

- `cordis.patch.yml` (shipped both at the repo root and inside `npm-package/`) inserts two rows:
  `preset-oh-my-dsh-slim` → `preset/preset.js`, and `omds-seeder` → `lib/index.js`
- `preset/preset.js` registers
  `{ id: 'oh-my-dsh-slim', name: '极简角色委派', order: 20, plugins: [...] }` — 19 top-level rows
  covering the six role tools, the orchestrator persona, the planning and compaction rows, and a
  `delegation` group
- the five package-local rows (`roles.js`, `subagent-result.js`, `subagent-roles.js`,
  `early-close-context.js`, `sandbox-strip.js`) are referenced by **absolute `file:` URLs built
  from `import.meta.url`**, never by relative paths: a row name resolves against the *declaring
  patch's* `baseUrl`, so a `./roles.js` row audits as "never started" and silently does nothing
- two rows are conditional: `tool-pwsh` is disabled off Windows, and `tool-plugin-manager` is
  disabled when the profile has no `profileContext` service

`lib/index.js` (`omds-seeder`) is the bundle's companion row, mounted in the *profile* plane. It
only reports: the preset it declared, the running host version and verdict, the role tools it
registered, and one line summarising the effective configuration. Mounting `{ verbose: true }` on
that row also logs the per-role table. A row that throws aborts the whole preset mount, so this
probe never gets to be fatal.

> The preset registry "neither scans directories nor accepts preset paths", so nothing is copied
> into `$DSH_HOME` and nothing needs cleaning up on uninstall.

## Configuration

Zero configuration is required — the shipped defaults travel with the package. User intent is read
in descending priority, and every channel shares one document shape and one merge rule (**user
values win key by key; arrays replace whole**):

1. The file named by the `OH_MY_DSH_SLIM_CONFIG` env var (test/CI channel)
2. `profile.json` beside the mounted preset copy (per-profile snapshot)
3. `$DSH_HOME/oh-my-dsh-slim.json` (the documented user file)
4. `defaults.json` bundled with the package (the lowest-priority layer, always present)

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

A compact `roles` map is accepted as well, and wins over `presets[<name>]`:

```json
{
  "preset": "my-dsh-normal",
  "roles": {
    "oracle": { "model": "deepseek-v4-pro", "effort": "max" },
    "explorer": { "enabled": false }
  }
}
```

- Per-role keys: `enabled`, `provider`, `model`, `effort`, `temperature`, `maxTokens`, `tools`,
  `deny`, `mcps`. `tools` is an exhaustive allow list (`tools.restrict()` semantics); an empty
  list means the same as "not configured", but a non-empty one must name known global tools.
  `advanced.roles.<roleId>` merges last, on top of everything else
- **Effort values are shape-checked, not vocabulary-checked.** The shipped vocabulary is
  `off`/`low`/`high`/`max`, but effort ids are adapter-owned and open-ended, so any well-formed
  token (letters, then letters/digits/`-`/`_`) is accepted and stays valid when the config moves to
  another machine. Whether the chosen model actually offers it is answered at delegation time by
  `omds-subagent-roles`, which asks `llm.resolveModelInfo` and fails with a readable error naming
  the model's declared efforts and its adapter default. `none` is not a token: a role with no
  `effort` simply inherits whatever the host resolved
- **Model validation happens at delegation time**: an unknown provider/model is reported by the
  host rather than silently ignored
- An unreadable or invalid configuration is **never fatal** — the row logs a warning and leaves the
  host's own defaults in place
- **observer is locked**: `observer.enabled: true` is ignored with a warning (see the role matrix)
- `model` / `maxTokens` / `tools` / `deny` / `mcps` are read when the preset mounts (per session);
  `effort` and `temperature` are re-read on **every** delegated request, so those two take effect
  on the next delegation even inside a session that is already running

**Conversational configuration** (no JSON editing needed): just say e.g. "change fixer's model to
deepseek-v4-pro" or "disable the oracle role" — the orchestrator edits the configuration document
for you.

## Self-tests

```bash
npm test
```

`node --test test/package.test.mjs` — eight structural tests that need no DSH install and cost
nothing:

- the two bundle patches agree on every row id and field
- the patch declares exactly one `@deepseek-ai/dsh-agent-preset` row, and it points at
  `preset/preset.js`
- **no preset row may name a relative path** — the regression guard for the "never started"
  failure described above; every package-local row resolves to an existing absolute `file:` URL
  under `npm-package/preset/` and is not YAML
- the six role rows are found through the shared `roles.js` URL, and their personas round-trip
  through `composeRolePersona` → `roleIdFromEvents`; each advertises its own `toolName`
- the role wrapper declares the five services the delegated host implementation needs, and the
  stock-shaped config it hands back keeps `toolName` and the persona and leaks no `definition`
- the bundled `defaults.json` reaches every role even with **no** user config file present
- a *partial* user override keeps the shipped `provider`, `effort`, `deny` and `maxTokens`
- every role carries its shipped route into the host's `agentOptions`
  (`provider`/`model`/`reasoningEffort`/`maxTokens`/`toolFilter`)

## Known limits

- **Upgrading requires a DSH restart**: the plugin composition mounts **once per host process** —
  configuration values re-resolve per session, but plugin code (tool schemas, tool descriptions,
  injected strings) is frozen in-process. After any plugin upgrade, restart DSH; new sessions alone
  still run the old code
- **Non-vision main models cannot receive pasted images**: DSH blocks image attachments at send
  time based on the main model's capability (`MODEL_DOES_NOT_SUPPORT_IMAGES`). For image analysis,
  use a vision-capable main model directly — or wait for upstream attachment forwarding. If your
  model actually supports images but is still blocked, check whether its provider configuration
  declares the image input modality (`input: ["text", "image"]`) — a common gap for third-party
  GPT-class models
- **web_search is billed separately**: librarian prefers MCP (free). `web_search` runs through the
  host search service, which issues an independent auxiliary model request per query. For open-ended
  research, give the task a search budget in the prompt
- **Delegated children cannot escalate sandbox permissions — the preset strips stray escalation
  fields (`sandbox-strip` plugin, a workaround)**: DSH fixes a delegated child's file policy and
  approval state at startup, but the `bash`/`edit`/`write` tool schemas still expose optional
  `sandbox_permissions` / `justification` fields. Some models fill those fields unprompted; a child
  cannot escalate anyway, so the extra arguments only trigger parameter-validation errors
  (`invalid justification`, `not strictly wider`). The bundled `sandbox-strip` plugin removes the
  two fields from role-subagent child tool calls at the `tools/pre-execute` waterfall and appends a
  `[sandbox: stripped ...]` note to the result so the model sees the correction. In this preset's
  own top-level sessions it additionally strips only the shapes DSH would always reject before any
  approval prompt (empty justification, single-field pairs, non-widening modes — judged with the
  host's own `WIDER_MODES` table); **legitimate escalation requests (strictly wider mode +
  non-empty justification) are kept and still prompt for approval**. Sessions that do not use this
  preset never load the plugin, so their behavior is unchanged. This is a preset-level workaround,
  not a fix: the real fix is upstream — DSH should stop exposing escalation fields to children whose
  permission scope is fixed
- **Background subagents and "early close" (`early-close-context` plugin)**: DSH is turn-based —
  a model either outputs or ends its turn; there is no mechanism-level way to force it to wait for a
  background subagent. Some models therefore close with a final conclusion while a delegated child
  is still running, claiming "done" without the child's result. The bundled `early-close-context`
  plugin mitigates this by supplying the model with facts: a live "currently running background
  subagents" block in the system prompt (re-rendered every turn, same mechanism as the host's
  `sandbox:policy`), a "Decision point" reminder attached to every successful delegation result,
  and a persona clause against claiming completion while a child is unsettled. The ledger is
  three-state (`running` → `reported` → `settled`): a child's interim **report** (host frame
  "Agent <id> sent a message:") is shown as "已回报内容，等待正式完成通知（reported ≠ 完成）" — a report
  neither concludes the child's turn nor changes its lifetime, and only the **finish notice**
  (unconditional for every established child, incl. failure/cancel/token-ceiling) settles it, so
  the orchestrator no longer announces "the subagent is done" tens of seconds early. In practice
  the delegation turn reports "still running; cannot output a final conclusion yet", defers
  dependent work until the finish notice, and wakes to integrate the result. The model may still
  end its turn before the child settles (no force-wait), but it no longer misreports completion
- **MCP servers are declared, not mounted into children**: the 0.2.0 delegation tool hands a child
  no `childCtx`, so a role's `mcps` list is carried by the configuration and by the librarian
  persona rather than by a per-child MCP scope. librarian still works — its persona directs it at
  context7/gh_grep, and the tools it can reach are the ones the session already has

## FAQ

**Which API key do I need?**
A DeepSeek API key — the shipped role models route through `deepseek-official`. Roles can be
pointed at any provider you imported in **Settings → Models**.

**Can I use other models per role?**
Yes — every role's provider, model, reasoning effort and temperature is configurable through the
JSON channels above (or conversationally). An unknown model fails loudly on the first delegation
instead of silently degrading.

**How do I uninstall?**
`dsh plugin --profile <profile> remove oh-my-dsh-slim`, then restart DSH. Nothing was copied into
`$DSH_HOME`, so there is no leftover directory to delete.

**Does this work on DSH 0.1.x?**
No. DSH 0.1.x has no declarative preset seam. On DSH ≤ 0.1.5-rc.2 use oh-my-dsh-slim 0.5.3; on the
0.1.6–0.1.x line, upgrade the host to 0.2.0-rc.2.

**Image analysis?**
Use a vision-capable main model and paste directly. The observer role is reserved until the harness
can forward attachments into subagent contexts.

## Roadmap

- **observer re-enable** — waiting on upstream DSH support for forwarding message attachments into
  subagent contexts (see the role matrix note above)
- **Per-role MCP delivery** — waiting on a `childCtx` (or equivalent) in the delegation seam so a
  child can be given its own MCP scope

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## Acknowledgments

- [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) (MIT © 2025
  alvinunreal) — role system and persona source
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — host platform

## License

[MIT](./LICENSE)
