// oh-my-dsh-slim — the bundle's companion row.
//
// DSH 0.2.0 replaced directory agent presets (a folder plus preset.yml under
// $DSH_HOME/.agent-presets) with declarative ones: a bundle patch inserts an
// `@deepseek-ai/dsh-agent-preset` row whose `config.plugins` IS the preset's
// plugin list. Everything this package ships is therefore declared in
// `preset/preset.js`, mounted by the loader before any session exists —
// there is nothing left to copy into DSH_HOME, and nothing to clean up on
// uninstall either.
//
// What remains is a visible record: one row that reports which preset and
// which role tools this bundle registered, and warns when the running host is
// outside the verified line. Both jobs are deliberately report-only. A row
// that throws aborts the whole preset mount (the registry audits every row and
// fails the preset on the first error), so a version probe never gets to be
// fatal here.
//
// Config (all optional, so the bundle row mounts with an empty config):
//   presetId: id to report. Default PRESET_ID.
//   verbose:  log the full per-role table on every boot. Default false.

import { homedir } from 'node:os';
import { join } from 'node:path';

import { hostVerdict } from './host-version.js';
import { advertisedRoles, roleIds } from '../preset/roles.js';
import { describeConfig, loadConfig } from '../preset/config.js';

export const name = 'omds-seeder';

const PRESET_ID = 'oh-my-dsh-slim';
const CONFIG_FILE_NAME = 'oh-my-dsh-slim.json';

/** Resolve DSH_HOME the way the host does, without importing host code. */
function dshHome() {
  const configured = process.env.DSH_HOME;
  if (typeof configured === 'string' && configured.length > 0) return configured;
  return join(homedir(), '.dsh');
}

/**
 * Log one report line, preferring the row logger over stderr.
 */
function report(ctx, line) {
  ctx.logger?.info?.(line);
}

/**
 * Mount the bundle's companion row.
 * @param ctx - the row context (a profile-plane row, not a preset row).
 * @param config - optional row config as documented above.
 */
export function apply(ctx, config) {
  const presetId = typeof config?.presetId === 'string' && config.presetId.length > 0 ? config.presetId : PRESET_ID;
  const verbose = config?.verbose === true;
  const verdict = hostVerdict();
  report(ctx, `oh-my-dsh-slim: agent preset "${presetId}" is declared by this bundle (declarative preset; no directory is seeded)`);
  report(ctx, `oh-my-dsh-slim: host DSH ${verdict.host ?? 'unknown'} - ${verdict.status}`);
  if (verdict.status === 'older' || verdict.status === 'directory' || verdict.status === 'legacy-preset-model') {
    ctx.logger?.warn?.(`oh-my-dsh-slim: ${verdict.message}`);
  }
  const roles = roleIds();
  report(ctx, `oh-my-dsh-slim: ${String(roles.length)} role tools: ${advertisedRoles()}`);
  try {
    const config = loadConfig();
    report(ctx, `oh-my-dsh-slim: ${describeConfig(config)}`);
    if (verbose) {
      const file = process.env.OH_MY_DSH_SLIM_CONFIG ?? join(dshHome(), CONFIG_FILE_NAME);
      report(ctx, `oh-my-dsh-slim: configuration file would be ${file}`);
      for (const roleId of roles) {
        const role = config.roles?.[roleId];
        if (role === undefined) continue;
        const route = `${role.provider ?? '?'}/${role.model ?? '?'}`;
        report(ctx, `oh-my-dsh-slim:   ${roleId}: ${role.enabled === false ? 'disabled' : 'enabled'} ${route} effort=${role.effort ?? '(host default)'}`);
      }
    }
  } catch (error) {
    ctx.logger?.warn?.(`oh-my-dsh-slim: cannot read the configuration (${error instanceof Error ? error.message : String(error)}); the preset falls back to its shipped defaults`);
  }
}
