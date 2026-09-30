// preset/subagent-roles.js — per-role model parameters for delegated children.
//
// DSH 0.2.0 dropped the 0.1.x mechanism this preset used to steer a role's
// request (an agent option field carried through the delegation request). What
// survives is the persona the child session persists in its
// `subagent/descriptor` event, which is written BEFORE the first
// `agent/request` of that child — so the waterfall can still tell which role
// is asking and rewrite the resolved route.
//
// This row is the 0.2.0 successor of the 0.1.x `effort-by-role.js`: one
// standing listener for all six roles, reading the same configuration file, so
// role temperature and reasoning effort keep working without a per-role tool
// fork. A missing or unreadable configuration is never fatal: the row falls
// back to the shipped defaults and, failing that, leaves the request alone.

import { loadConfig, roleDefaults, ROLE_IDS } from './config.js';
import { isSubagent, roleIdForAgent } from './roles.js';

/** Cordis plugin name. */
export const name = 'omds-subagent-roles';
/** `llm` is optional on purpose: without it the row still applies temperature
 * and keeps each role's configured effort, it just cannot verify the effort
 * against the model's declared list before the host does. */
export const inject = ['llm'];

/** The orchestrator's own temperature, applied when the host resolved none. */
const ORCHESTRATOR_TEMPERATURE = 0.1;


/** Effective role facts per (role, provider, model, effort) — model metadata is
 * stable for the life of a registration, and a verdict that could not be
 * determined is deliberately not cached. */
const effortCache = new Map();

function text(value) {
  return typeof value === 'string' && value.length > 0;
}

function isEffort(value) {
  return text(value) && value !== 'none';
}

/**
 * The configured facts for one role, or undefined for the orchestrator or an
 * unknown role.
 * @param agent - a live agent from the agent/request payload.
 */
function roleFacts(agent) {
  const roleId = roleIdForAgent(agent);
  if (!ROLE_IDS.includes(roleId)) return undefined;
  let configured;
  let source;
  try {
    const config = loadConfig();
    configured = config.roles[roleId] ?? roleDefaults(roleId) ?? {};
    source = config.source;
  } catch (error) {
    configured = {};
    process.stderr.write('oh-my-dsh-slim: cannot read the role configuration (' +
      String(error instanceof Error ? error.message : error) + '); using host defaults for role "' + roleId + '"' +
      String.fromCharCode(10));
  }
  return { roleId, configured, source };
}

/**
 * Validate one effort against the model's declared reasoning efforts.
 *
 * The host rejects an undeclared effort at dispatch time with
 * `provider "..." model "..." does not support reasoning effort "..."`; failing
 * here instead names the role and the fix, and keeps the misconfiguration out
 * of the child's first request.
 * @throws when the model declares its efforts and the configured one is absent.
 */
async function verifyEffort(ctx, provider, model, effort, source) {
  if (!text(provider) || !text(model)) return;
  const llm = ctx.get('llm');
  if (llm === undefined || typeof llm.resolveModelInfo !== 'function') return;
  const key = provider + '|' + model + '|' + effort;
  const cached = effortCache.get(key);
  if (cached !== undefined) return;
  let info;
  try {
    info = await llm.resolveModelInfo(provider, model, undefined);
  } catch (error) {
    // Unknown provider or model: the host reports that on its own terms.
    return;
  }
  const declared = info?.reasoning;
  if (declared === undefined || !Array.isArray(declared.efforts) || declared.efforts.length === 0) return;
  const ids = declared.efforts.map((entry) => String(entry?.id));
  if (ids.includes(effort)) {
    effortCache.set(key, true);
    return;
  }
  const withDefault = text(declared.defaultEffort) ? [...ids, 'default: ' + declared.defaultEffort] : ids;
  throw new Error(
    'oh-my-dsh-slim: reasoning effort "' + effort + '" is not offered by "' + provider + '/' + model + '".' +
    ' Declared efforts: ' + withDefault.join(', ') + '.' +
    " Fix the role's effort in the preset configuration (" +
    (text(source) ? source : 'the oh-my-dsh-slim configuration file') + ').',
  );
}

/**
 * The config patch this role's request needs. Temperature only fills a value
 * the host resolved as undefined, so a session-level choice is never
 * overwritten; effort is the role configuration's own field and therefore
 * always applied. Changing the role's model without a matching effort drops the
 * effort the host inherited for the previous model rather than forwarding a
 * value that model may not declare.
 * @returns the patch, or undefined when the request needs no change.
 */
async function requestPatch(ctx, payload, resolved) {
  const child = isSubagent(payload?.agent);
  if (!child) {
    if (resolved?.temperature === undefined) return { temperature: ORCHESTRATOR_TEMPERATURE };
    return undefined;
  }
  const facts = roleFacts(payload.agent);
  const configured = facts?.configured ?? {};
  const provider = text(configured.provider) ? configured.provider : resolved?.provider;
  const model = text(configured.model) ? configured.model : resolved?.model;
  const patch = {};
  if (isEffort(configured.effort)) {
    await verifyEffort(ctx, provider, model, configured.effort, facts?.source);
    if (resolved?.reasoningEffort !== configured.effort) patch.reasoningEffort = configured.effort;
  } else if (resolved?.reasoningEffort !== undefined && providedRoute(configured) !== resolvedRoute(resolved)) {
    // The role pinned a different route and declared no effort for it: the
    // effort the host inherited belongs to the previous model, and forwarding
    // it would be rejected at dispatch time.
    patch.reasoningEffort = undefined;
  }
  if (typeof configured.temperature === 'number' && resolved?.temperature === undefined) {
    patch.temperature = configured.temperature;
  }
  return Object.keys(patch).length === 0 ? undefined : patch;
}

function providedRoute(configured) {
  return (text(configured?.provider) ? configured.provider : '*') + '/' + (text(configured?.model) ? configured.model : '*');
}

function resolvedRoute(resolved) {
  return String(resolved?.provider ?? '*') + '/' + String(resolved?.model ?? '*');
}

/** Apply the row: one standing listener for every role in this preset. */
export function apply(ctx) {
  ctx.effect(() => ctx.on('agent/request', async (payload, next) => {
    const resolved = await next();
    const patch = await requestPatch(ctx, payload, resolved);
    return patch === undefined ? resolved : { ...resolved, ...patch };
  }, { global: true }), 'omds-subagent-roles: agent/request');
}
