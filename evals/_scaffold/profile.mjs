// The execution profile a round is recorded with, and the pin a suite can hold it to.
//
// A profile is an operator attestation: the harness, model, reasoning effort, reported CLI version
// and tool policy the recording host says it ran. Nothing here can verify that the host really ran
// what it declared; what these rules decide is what may be declared and archived.
//
// **This module is deliberately not one of any suite's `instrumentFiles`**, like `round-core.mjs`:
// no run reads it. The pin itself lives in the suite configuration, which *is* hashed, so editing
// the pin already stales every archived stamp; hashing the rules that compare against it would add
// nothing but a second reason for the same staleness. It also lives apart from `round-core.mjs` so
// that `suite-loader.mjs` can validate a pin without importing the round coordinator, which pulls
// in the scaffold and the build identity and has module-load side effects.

export const PROFILE_KEYS = Object.freeze([
  'harness',
  'model',
  'reasoningEffort',
  'reportedVersion',
  'toolPolicy',
]);

// The value an omitted profile flag is recorded as. It is spelled out rather than left empty so an
// archived round says "not declared" instead of looking like a declaration of nothing, and a pin
// may never expect it: a pinned key the operator omitted is a mismatch, not a match.
const UNKNOWN = 'unknown';

export function sameKeys(value, keys) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

// Session and account identifiers, links and home-directory paths never belong in an archived
// profile: the archive is committed, and a profile value is free text an operator types.
function sensitiveProfileValue(value) {
  return (
    /(?:session|thread|task)[_-]?id|https?:\/\/|account|e-?mail|@/i.test(value) ||
    /(?:^|[\s=])(?:\/Users\/|\/home\/|~[\\/])/.test(value)
  );
}

export function normalizeProfile(profile = {}) {
  const unknown = Object.keys(profile).filter((key) => !PROFILE_KEYS.includes(key));
  if (unknown.length > 0)
    throw new Error(`execution profile has unknown fields: ${unknown.join(', ')}`);
  const normalized = {};
  for (const key of PROFILE_KEYS) {
    const value = profile[key] ?? UNKNOWN;
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`execution profile ${key} must be a non-empty string`);
    }
    if (sensitiveProfileValue(value)) {
      throw new Error(`execution profile ${key} contains a sensitive or link-like value`);
    }
    normalized[key] = value.trim();
  }
  if (!sameKeys(normalized, PROFILE_KEYS)) throw new Error('execution profile has unknown fields');
  return normalized;
}

// Whether a suite's `expectedProfile` is usable: `null` for a suite that deliberately pins nothing,
// or a plain object naming a non-empty subset of the profile keys. Each pinned value has to be one
// a normalized profile could actually carry — a non-empty string already in its trimmed form, not
// the "unknown" placeholder, and not sensitive — because the comparison below is exact and runs on
// the normalized value, so a pin no normalized profile can equal would reject every round.
export function isValidProfilePin(pin) {
  if (pin === null) return true;
  if (typeof pin !== 'object' || Array.isArray(pin)) return false;
  if (Object.getPrototypeOf(pin) !== Object.prototype && Object.getPrototypeOf(pin) !== null) {
    return false;
  }
  const keys = Object.keys(pin);
  if (keys.length === 0 || !keys.every((key) => PROFILE_KEYS.includes(key))) return false;
  return keys.every((key) => {
    const value = pin[key];
    return (
      typeof value === 'string' &&
      value !== '' &&
      value === value.trim() &&
      value !== UNKNOWN &&
      !sensitiveProfileValue(value)
    );
  });
}

// Every pinned key whose value in `profile` differs, with both values, in `PROFILE_KEYS` order. The
// comparison is exact — `GPT-6-SOL` is not `gpt-6-sol` — like the rest of the profile handling, and
// an unpinned key never mismatches. A `null` pin has no mismatches.
export function profilePinMismatches(pin, profile) {
  if (pin === null) return [];
  return PROFILE_KEYS.filter((key) => Object.hasOwn(pin, key) && profile?.[key] !== pin[key]).map(
    (key) => ({ key, expected: pin[key], actual: profile?.[key] }),
  );
}

// The single rejection both enforcement points share, so a round refused at `prepare` and a
// generation refused at `publish` name the deviation the same way: every mismatching key, what the
// suite pins and what was declared.
export function assertProfileMatchesPin(pin, profile, label) {
  const mismatches = profilePinMismatches(pin, profile);
  if (mismatches.length === 0) return;
  const details = mismatches
    .map(
      ({ key, expected, actual }) =>
        `${key} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual ?? null)}`,
    )
    .join('; ');
  throw new Error(`${label} does not match the suite's pinned execution profile: ${details}`);
}
