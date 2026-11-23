// Shared issue intake: the runner's permission proof and the author trust that decides which
// tracker markers and comments a run may act on.
//
// `backlog-audit-core.mjs` imports this module; it imports no caller back. Input parsing, the
// tracker session, the hashing and a caller's write vocabulary stay with each caller and are
// injected through `createIssueIntake`, so every caller keeps its own error class, envelope and
// capability keys while the decision itself exists once.
import { isWritePermission } from './remote-tracker-shared-core.mjs';

export function forgeLogin(value) {
  return typeof value === 'string' &&
    /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,38}[A-Za-z0-9])?$/.test(value)
    ? value.toLowerCase()
    : null;
}

// A marker counts only from an author this run may trust: the proven runner itself, or an author
// whose write permission is stated. Anyone else can paste the marker text into a comment.
export function trustedAuthor(author, runnerLogin) {
  if (author?.write === true) return true;
  return (
    typeof runnerLogin === 'string' &&
    typeof author?.login === 'string' &&
    author.login.toLowerCase() === runnerLogin
  );
}

export async function resolveAuthor(author, permissionOf) {
  if (author.write === undefined) author.write = await permissionOf(author.login);
  return author;
}

// Binds the decision logic to one caller:
// - `ErrorClass`: the caller's error class; a tracker failure is an instance of it and carries
//   `trackerCode` and `trackerStatus`, and any other error propagates unchanged.
// - `writeActions`: the caller's closed write vocabulary, the action keys of an external proof.
// - `capabilitiesFromProbe(probe)`: the forge capabilities a proven run records.
// - `capabilitiesFromAttestation(attestation)`: keys an external proof records after its actions.
// - `withHash(value, key)`: the caller's tamper-evidence hashing.
export function createIssueIntake({
  ErrorClass,
  writeActions,
  capabilitiesFromProbe,
  capabilitiesFromAttestation,
  withHash,
}) {
  const ownError = (error) => {
    if (!(error instanceof ErrorClass)) throw error;
  };

  // Write permission per login, read once per login. Unknown permission never counts as write. A
  // forge that refuses to state another user's permission (Forgejo answers a non-admin with 403)
  // leaves that login unknown and is recorded in `unreadable`, so the run can say why so many
  // items are flagged instead of implying their authors lack write access.
  function permissionCache(session) {
    const cache = new Map();
    const unreadable = new Set();
    const permissionOf = async (rawLogin) => {
      const login = forgeLogin(rawLogin);
      if (!login) return null;
      if (!cache.has(login)) {
        let value = null;
        try {
          const permission = (await session.call('collaborator-permission-read', { login })).result
            ?.permission;
          value = isWritePermission(permission);
        } catch (error) {
          ownError(error);
          value = error.trackerCode === 'TARGET_NOT_FOUND' ? false : null;
          if (error.trackerStatus === 403) unreadable.add(login);
        }
        cache.set(login, value);
      }
      return cache.get(login);
    };
    permissionOf.unreadable = unreadable;
    return permissionOf;
  }

  // The proof for an already validated request. `target` is the normalized target, recorded as
  // given; `plansOnlyReason` forces a plans-only proof when set; `external` is the validated
  // attestation of an external target, or undefined; `openSession()` opens the forge session
  // (`repository`, `probe`, `call`) and is called only for a forge target.
  async function proveRunnerPermission({ target, plansOnlyReason, external, openSession }) {
    const base = { target, login: null, permission: null, provider: null, repository: null };
    const plansOnly = (reason, extra = {}) =>
      withHash(
        {
          ...base,
          ...extra,
          mode: 'plans-only',
          proven: false,
          reason,
          ...(reason === 'unset-mode' ? { hint: 'setup' } : {}),
          capabilities: null,
        },
        'proofHash',
      );
    if (plansOnlyReason) return plansOnly(plansOnlyReason);
    if (target.kind === 'external') {
      // The orchestrator owns the external connection; this helper only records the attestation
      // it was handed, and anything short of an explicit proof of both read and write is unproven.
      if (external === undefined) return plansOnly('external-capability-unknown');
      if (!external.readProven || !external.writeProven)
        return plansOnly('external-capability-unproven', { provider: 'external' });
      const actions = Object.fromEntries(
        writeActions.map((action) => [action, external.actions?.[action] === true]),
      );
      return withHash(
        {
          ...base,
          login: external.login === undefined ? null : external.login.trim().toLowerCase(),
          provider: 'external',
          mode: 'tracker',
          proven: true,
          reason: null,
          connection: external.connection.trim(),
          capabilities: { ...actions, ...capabilitiesFromAttestation(external) },
        },
        'proofHash',
      );
    }
    const session = await openSession();
    const repository = {
      host: session.repository.host,
      owner: session.repository.owner,
      repository: session.repository.repository,
      slug:
        session.repository.slug ?? `${session.repository.owner}/${session.repository.repository}`,
      provider: session.repository.provider,
    };
    const known = { ...base, provider: repository.provider, repository };
    let login;
    try {
      login = (await session.call('viewer-read')).result?.login;
    } catch (error) {
      ownError(error);
      return plansOnly('viewer-unreadable', known);
    }
    if (typeof login !== 'string' || login === '') return plansOnly('viewer-unreadable', known);
    let permission;
    try {
      permission = (await session.call('collaborator-permission-read', { login })).result
        ?.permission;
    } catch (error) {
      ownError(error);
      return plansOnly('permission-unreadable', { ...known, login: login.toLowerCase() });
    }
    const identity = { ...known, login: login.toLowerCase(), permission: permission ?? null };
    if (!isWritePermission(permission)) return plansOnly('permission-insufficient', identity);
    return withHash(
      {
        ...identity,
        mode: 'tracker',
        proven: true,
        reason: null,
        capabilities: capabilitiesFromProbe(session.probe),
      },
      'proofHash',
    );
  }

  return { permissionCache, proveRunnerPermission };
}
