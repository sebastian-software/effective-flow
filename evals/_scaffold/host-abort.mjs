// The one way an attempt that already left evidence may still be retried as aborted: the host
// stopped it for a reason outside the run — today only a provider that refused the session for
// capacity — and the stop receipt carries the host's own error line to show it.
//
// **Attestation stays the model, and the error line narrows what can be attested.** Every receipt
// this instrument reads is the operator's word, and this one is too: the scaffold cannot see the
// host's output. What it can do is refuse any word but a closed one. A session that ended because
// the run gave up, refused, or finished early ends on the run's own text and a zero exit, and no
// line it printed matches a pattern below; to claim a capacity abort for it, an operator has to
// copy in a provider error the session never printed, which is a false receipt rather than a
// misreading. The cause and the line are retained in the quarantined attempt's `retry.json`.
//
// **The patterns are keyed by the harness the round was prepared with, never by the receipt.** A
// pattern belongs to the client that prints it, and the manifest's profile is what every slot of
// the round was attested to run under. A harness with no entry admits no host abort at all, so a
// round recorded on a new client fails closed until its error lines are named here. Each pattern
// is anchored at both ends and matched against one line, so nothing can ride along behind a
// recognised prefix.
//
// This module is deliberately not an instrument file: it decides which attempts may be discarded,
// never what a run sees, so a change here owes no re-recorded round.

const CODEX_CLI_CAPACITY = Object.freeze([
  /^ERROR: exceeded retry limit, last status: 429 Too Many Requests$/,
  /^ERROR: Selected model is at capacity\.?(?: Please try a different model\.?)?$/,
]);

export const HOST_ABORT_CAUSES = Object.freeze({
  'provider-capacity': Object.freeze({ 'codex-cli': CODEX_CLI_CAPACITY }),
});

export const HOST_ERROR_MAX_LENGTH = 200;

const STOP_RECEIPT_KEYS = ['reason', 'schemaVersion', 'stopped'];
const HOST_ABORT_RECEIPT_KEYS = ['cause', 'hostError', 'reason', 'schemaVersion', 'stopped'];

function sameSortedKeys(value, keys) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys);
}

// Validates a stop receipt and returns its host-abort part, or `null` for a plain stop. Throws on
// anything else, a host abort naming an unknown cause or an unrecognised error line included.
export function stopReceiptHostAbort(assertion, harness) {
  const plain =
    assertion &&
    typeof assertion === 'object' &&
    !Array.isArray(assertion) &&
    (sameSortedKeys(assertion, STOP_RECEIPT_KEYS) ||
      sameSortedKeys(assertion, HOST_ABORT_RECEIPT_KEYS)) &&
    assertion.schemaVersion === 1 &&
    assertion.stopped === true &&
    typeof assertion.reason === 'string' &&
    assertion.reason.trim() !== '';
  if (!plain) {
    throw new Error(
      'retry-aborted requires {schemaVersion:1, stopped:true, reason}, optionally with cause and hostError',
    );
  }
  if (!Object.hasOwn(assertion, 'cause')) return null;
  const { cause, hostError } = assertion;
  if (typeof cause !== 'string' || !Object.hasOwn(HOST_ABORT_CAUSES, cause)) {
    throw new Error(
      `stop receipt cause must be one of ${Object.keys(HOST_ABORT_CAUSES).join(', ')}`,
    );
  }
  const patterns = HOST_ABORT_CAUSES[cause][harness];
  if (!patterns) {
    throw new Error(`no ${cause} error lines are known for the round's harness ${harness}`);
  }
  if (
    typeof hostError !== 'string' ||
    hostError.length > HOST_ERROR_MAX_LENGTH ||
    /[\r\n]/.test(hostError) ||
    !patterns.some((pattern) => pattern.test(hostError))
  ) {
    throw new Error(
      `stop receipt hostError is not one ${cause} error line ${harness} prints; ` +
        `copy the host's line verbatim (known: ${patterns.map(String).join(', ')})`,
    );
  }
  return { cause, hostError };
}
