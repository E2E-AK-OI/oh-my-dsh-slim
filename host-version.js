// host-version.js — shared host-DSH compatibility gate for the preset plugins.
//
// This preset targets DSH >= 0.1.2-rc.1 (0.1.2 removed/changed APIs the preset
// depends on: registerContinuableSetup, the agent/inbox/inserted event
// vocabulary, the native agent-presets authoring API). On older hosts the
// preset must fail fast with a readable error instead of mounting
// half-working: every plugin row calls assertHostCompatible() at module load,
// and one throw aborts the whole preset mount (cordis fail-fast).
//
// Two bounds (2026-09-28): the floor above, and a CEILING at 0.1.6. DSH 0.1.7
// replaced directory agent presets with declarative ones declared by plugin
// bundles, and explicitly rejected keeping both sources; this preset line
// delivers a directory preset, so on 0.1.7 it would install cleanly and then
// never appear. The ceiling turns that silent no-op into a readable refusal.
// The declarative-preset line is in development.
//
// Policy details:
// - Undetectable host version → fail-open. The bare-specifier resolution only
//   works when @deepseek-ai/dsh is a sibling package (the real profile
//   layout); unusual layouts are not proof of an unsupported host, and
//   guessing would break valid setups.
// - Escape hatches, one per direction: OMDS_ALLOW_OLD_HOST=1 (tests/CI pinned
//   to an old host) and OMDS_ALLOW_NEW_HOST=1 (compatibility probing on a host
//   above the ceiling).

import { createRequire } from 'node:module';

export const MIN_HOST_VERSION = '0.1.2-rc.1';
/** First host line this preset does NOT support (0.1.7's declarative presets). */
export const MAX_HOST_VERSION_EXCLUSIVE = '0.1.6';

/**
 * Full semver comparison with prerelease support (numeric-major/minor/patch,
 * then prerelease identifiers: release > prerelease, numeric identifiers
 * compare numerically, otherwise lexically). Returns <0 / 0 / >0.
 */
export function compareSemver(a, b) {
  const parse = (v) => {
    const [core, pre = ''] = String(v).split('-');
    const [maj, min, pat] = core.split('.').map((n) => parseInt(n, 10) || 0);
    return { maj, min, pat, ids: pre === '' ? [] : pre.split('.') };
  };
  const x = parse(a);
  const y = parse(b);
  for (const k of ['maj', 'min', 'pat']) {
    if (x[k] !== y[k]) return x[k] - y[k];
  }
  if (x.ids.length === 0 && y.ids.length === 0) return 0;
  if (x.ids.length === 0) return 1;
  if (y.ids.length === 0) return -1;
  for (let i = 0; i < Math.max(x.ids.length, y.ids.length); i++) {
    const xi = x.ids[i];
    const yi = y.ids[i];
    if (xi === undefined) return -1;
    if (yi === undefined) return 1;
    const xn = /^\d+$/.test(xi);
    const yn = /^\d+$/.test(yi);
    if (xn && yn) {
      const d = Number(xi) - Number(yi);
      if (d !== 0) return d;
    } else if (xn) {
      return -1;
    } else if (yn) {
      return 1;
    } else if (xi !== yi) {
      return xi < yi ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Best-effort host DSH version. Resolves @deepseek-ai/dsh/package.json as a
 * sibling of this package (the real profile layout). Returns undefined when
 * the host package cannot be resolved — callers treat that as "unknown" and
 * fail open.
 */
export function detectHostDshVersion() {
  try {
    return createRequire(import.meta.url)('@deepseek-ai/dsh/package.json').version;
  } catch {
    return undefined;
  }
}

/**
 * Core version (major.minor.patch), dropping any prerelease suffix. The ceiling
 * is a LINE boundary, not a semver point: an unverified line (0.1.6-alpha.1,
 * 0.1.6-rc.1, 0.1.6) is admitted or refused as a whole, because "the 0.1.6
 * prerelease sorts below 0.1.6" would silently let hosts in that we never
 * tested. The floor keeps full semver semantics.
 */
export function coreVersion(version) {
  return String(version).split('-')[0];
}

/**
 * Throw when the host is outside the supported range: older than the floor
 * (0.1.2-rc.1) or in/above the ceiling line (0.1.6 — the declarative-preset
 * line). `options.version` overrides detection (unit tests); `options.minVersion`
 * and `options.maxExclusiveVersion` override the bounds. Returns the host
 * version when compatible, undefined when unknown or waived by an escape hatch.
 */
export function assertHostCompatible(options = {}) {
  const minVersion = options.minVersion ?? MIN_HOST_VERSION;
  const maxExclusive = options.maxExclusiveVersion ?? MAX_HOST_VERSION_EXCLUSIVE;
  const host = options.version ?? detectHostDshVersion();
  if (host === undefined) return undefined;
  if (compareSemver(host, minVersion) < 0) {
    if (process.env.OMDS_ALLOW_OLD_HOST === '1') return undefined;
    throw new Error(
      `oh-my-dsh-slim requires DSH >= ${minVersion} (this host: DSH ${host}). ` +
      'The preset will not mount half-working: upgrade DSH to 0.1.2-rc.1 or newer, ' +
      'or use oh-my-dsh-slim 0.4.0, the last release for older DSH lines.',
    );
  }
  if (maxExclusive !== undefined && compareSemver(coreVersion(host), coreVersion(maxExclusive)) >= 0) {
    if (process.env.OMDS_ALLOW_NEW_HOST === '1') return undefined;
    throw new Error(
      `oh-my-dsh-slim supports DSH < ${maxExclusive} (this host: DSH ${host}). ` +
      'DSH 0.1.7 replaced directory agent presets with declarative ones declared by plugin ' +
      'bundles, so this preset version would install and then never appear; the preset line ' +
      'supporting that model is still in development. ' +
      'Fix: stay on DSH <= 0.1.5-rc.2 (the latest verified host) with oh-my-dsh-slim 0.5.x. ' +
      'For compatibility probing on a newer host, set OMDS_ALLOW_NEW_HOST=1.',
    );
  }
  return host;
}
