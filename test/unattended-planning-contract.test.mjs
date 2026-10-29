import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  extractBody,
  parseAskBlock,
  renderBody,
  resolveEagerIncludes,
  resolveLazyIncludes,
} from '../build-lib.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const source = (...parts) => readFileSync(join(SRC, ...parts), 'utf8');
const shared = (name) => source('shared', `${name}.md`);
const toolBody = (name) => extractBody(source('tools', `${name}.md`));

function eager(body, context = 'test') {
  return resolveEagerIncludes(body, {
    context,
    readFragment: (name) => shared(name),
  });
}

function closure() {
  const seen = new Set();
  const queue = ['tools/plan.md', 'tools/plan-review.md'];
  while (queue.length) {
    const relative = queue.shift();
    if (seen.has(relative)) continue;
    seen.add(relative);
    const text = source(...relative.split('/'));
    for (const match of text.matchAll(
      /^```(?:include|lazy-include)\n([^\n]+)(?:\nwhen:[^\n]+)?\n```/gm,
    )) {
      const name = match[1].trim();
      if (!['unattended-planning', 'planning-readiness'].includes(name))
        queue.push(`shared/${name}.md`);
    }
  }
  return [...seen].sort();
}

const QUESTION_RE = /\bask(s|ed)?\b|\bclarif(y|ication)\b|\bconfirm(ation)?\b|AskUserQuestion/i;
const FENCE_RE = /^```ask\s*$/;
// Frozen lexical closure inventory: each entry must be explained by a mapped site or by a
// boundary/setup reason. The exact source line text is retained in the collected key, so a new
// question cannot pass by merely preserving the old count. Duplicate lines retain their count.
const QUESTION_INVENTORY = Object.freeze(
  Object.entries({
    'shared/apply-source-detection.md': [
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        '(leftover forge issue or tool shorthand) and is asked about instead of guessed. Multiple',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        'asks (see "Ambiguity and fallbacks").',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        '`<RUNTIME_STATE_ROOT>/.effective-flow/review/` directory) and asks for the specific source. If the resolved',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        '- **`ambiguous`:** name the competing interpretations and ask, instead of',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        'and `plain-issue`): do not guess. Ask the user to split the list by target type,',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        'or — in the router — route per issue. Conservative: ask. A list that mixes a forge reference',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        'with an external-target reference is never resolved heuristically either: ask the user to split',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        '- **Unresolvable path:** `ambiguous` → ask or error message; note that',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        'handle. On `none`/`ambiguous`/mixed list: ask.',
      ],
    ],
    'shared/central-reasoning-delegation.md': [
      [
        'P-ESC',
        "completed: its resume hint asks for the checked scope plus `DONE`/`ABORT`, then the protocol's retry",
      ],
    ],
    'shared/chat-language.md': [
      [
        'not-a-site: Guided setup alone asks for chat language; the planning envelope already supplies resolved context',
        'read-only, asks `Chat` in that language as its first substantive question, and then binds the',
      ],
      [
        'not-a-site: setup persistence confirmation is outside plan and file-review execution',
        "German are pending `en`/`de`, and none is persisted before setup's common confirmation. Express,",
      ],
      [
        'not-a-site: defines the language of interactive output rather than a question to invoke',
        "Scope is every interactive output: free prose, status updates, completion reports, an `ask` block's header,",
      ],
    ],
    'shared/completion-protocol.md': [
      [
        'P-ESC',
        '- clarify the options as free text: complete manually, continue with the next phase, abort the workflow',
      ],
    ],
    'shared/config-migration.md': [
      [
        'not-a-site: describes a null completion default; P-PUB prevents completion selection in this run',
        '`state: unset` is not set → the owning tool\'s default; `value: null` is explicit and means "ask',
      ],
      [
        'not-a-site: describes completion configuration values; P-PUB prevents completion selection in this run',
        'at run time" (no `delivery.completion` → default `merge`; `delivery.completion | null` → ask).',
      ],
      [
        'not-a-site: describes PR-review configuration values; P-PUB prevents PR review in this run',
        '- **`delivery.prReview`** → `ask`, `always`, or `off`; unset resolves to `ask`. What it governs is',
      ],
    ],
    'shared/doc-categories.md': [
      [
        'P-DOC',
        'the write boundary, the target-path approval, and the collision clarification in either case, and',
      ],
    ],
    'shared/issue-tracker-forge.md': [
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        'per-run confirmation by the user. This gate binds every publisher of review findings and',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        'target alike. The producing workflow owns the classification and the confirmation',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        '- **Confirmation before publication:** publication happens only after an explicit user decision in',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        '- **Ambiguous host:** use `remoteToolOverride` or a per-run hint; if both are unclear, ask the user.',
      ],
    ],
    'shared/language-rules.md': [
      [
        'R-LNG',
        'requests translation. If it is mixed or unclear, clarify before changing human-readable prose.',
      ],
    ],
    'shared/memory-state.md': [
      [
        'not-a-site: a delegated worker returns lock diagnostics and never asks during planning',
        'identity, and lock path, and block the owning mutation. A delegated worker never asks the user;',
      ],
      [
        'not-a-site: orphan removal belongs to explicit cleanup, never plan or file review',
        'only as the orchestrator, run `lock inspect` (`{cwd, lock}`), obtain explicit user confirmation',
      ],
    ],
    'shared/outcome-continuation.md': [
      [
        'not-a-site: continuing inside existing authority explicitly needs no redundant confirmation',
        'unknown time/cost is no usable bound. Resume without redundant confirmation when guarantees,',
      ],
      [
        'P-CLR',
        'endpoint blocked while independent authorized work proceeds. Ask only for changed commitments',
      ],
      ['P-CLR', 'or missing authority; an unattended run returns a blocker and asks nothing.'],
    ],
    'shared/plan-lint.md': [
      [
        'P-VAL',
        'clarification gate — stay normative; the script only evaluates their countable rules. Judgment',
      ],
      [
        'P-VAL',
        'fall back to evaluating these rules by hand. The clarification gate treats the plan as **not',
      ],
    ],
    'shared/plan-numbering.md': [
      ['P-NUM', '- If more than one file matches, ask; never heuristically pick the "newest".'],
    ],
    'shared/plan-publication.md': [
      ['P-PUB', 'plan stays local as today. Ask nothing and report no publication line.'],
      ['P-PUB', 'no separate completion question is asked.'],
      ['P-PUB', 'reason: ask nothing, write nothing, and report it.'],
      ['P-PUB', 'asked or written; a nonzero exit is its own named reason.'],
      [
        'P-PUB',
        '`git -C <RUNTIME_STATE_ROOT> rev-parse <fetched head OID>:<P>`, there is nothing to republish: ask',
      ],
      [
        'P-PUB',
        'Ask exactly once, naming the remote, the base branch, the branch, that the pull request is a draft,',
      ],
      ['P-PUB', '```ask'],
      ['P-PUB', 'header: Publish plan'],
      [
        'P-PUB',
        'Then confirm the draft, because Forgejo can ignore the work-in-progress prefix a draft request',
      ],
    ],
    'shared/plan-reference-routing.md': [
      ['P-NUM', '4. If multiple files match: ask the user for the specific file.'],
      [
        'P-REV',
        '- exactly one status line `**Planungsstatus:** Umgesetzt` or `**Plan status:** Implemented` → ask the user whether the plan should be implemented again, only checked, or whether the workflow should be aborted.',
      ],
      [
        'P-REV',
        'implemented and ask. If not, ask whether the plan should be used as an unbuilt specification.',
      ],
      [
        'P-REV',
        '- only ask to continue if the user explicitly wants to use the plan with the current workflow anyway',
      ],
      ['P-VAL', 'The check for open or unclarified points is handled by the "clarification gate"'],
    ],
    'shared/pr-review-comments.md': [
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        "`{{SKILL:merge-gate}}`'s set-aside confirmation is the one that does – has to take the thread's `url`",
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        'report the still-pending checks and ask the user instead – **once per run**, not once per repeated',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        'wait, so a consumer that waits again later reports the pending checks and asks nothing.',
      ],
    ],
    'shared/pr-review-integration.md': [
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        "A `local-only` finding reaches a pull request only after the gate's explicit per-run confirmation,",
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        'Governed by the configuration key `delivery.prReview` with the values `ask` (default), `always`, and',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        '- `ask` — resolved by the run state:',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        '- **gated** — ask exactly once with the question below.',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        '```ask',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        'when: a delivery created or reused a pull request, `delivery.prReview` is `ask` or unset, and the run is gated',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        'header: PR review',
      ],
    ],
    'shared/security-disclosure-gate.md': [
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        'severity, and short title, then ask. Keeping them local is the default: an unanswered, skipped, or',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        '```ask',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        'header: Security',
      ],
    ],
    'shared/session-rename.md': [
      [
        'P-TTL',
        'Consent belongs to the host. Its contract replaces a title the **user** set only after the app asks',
      ],
    ],
    'shared/session-title.md': [
      [
        'P-TTL',
        "declines rather than being asked — both simply arrive as the call's reported outcome, and neither",
      ],
    ],
    'shared/worktree-integration.md': [
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        'Only when the user explicitly asks for in-place work without a worktree and wants no',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        '"prReview": "ask"',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        '- `delivery.prReview`: `"ask"` (a gated run asks once per created pull request)',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        '- `delivery.prReview`: `"ask"`, `"always"`, `"off"`',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        'scope, files recorded as produced by the workflow, or explicit user confirmation. Preserve',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        'ask. This reliably keeps newly created plans, `.effective-flow/` state and other',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        'mark or archive a plan, commit, ask for or execute a completion action, push, merge or create a',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        'Effective Flow configuration (project setup ADR). Otherwise ask:',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        '```ask',
      ],
      [
        'not-a-site: P-PUB skips publication before this downstream delivery path is loaded',
        'header: Completion',
      ],
    ],
    'shared/worktree-lifecycle.md': [
      [
        'not-a-site: worktree cleanup confirmation belongs to explicit cleanup; P-PUB prevents publication provisioning',
        'After explicit user confirmation, process each selected candidate independently:',
      ],
      [
        'not-a-site: worktree cleanup confirmation belongs to explicit cleanup; P-PUB prevents publication provisioning',
        'before rerunning cleanup; ask the known owner before unlocking a Git-locked worktree; let the',
      ],
    ],
    'tools/plan-review.md': [
      [
        'R-IN',
        'If the mode or reference is missing or ambiguous, ask for the specific plan file or return to the',
      ],
      [
        'R-LNG',
        'In issue mode, confirm it agrees with the concrete language in the delegation receipt. If the',
      ],
      [
        'R-LNG',
        'artifact is mixed or unclear, clarify before editing; do not infer language from the marker.',
      ],
      [
        'R-STA',
        'implemented, ask whether it should be reviewed retrospectively, reopened for a follow-up',
      ],
      ['R-DEC', 'risk, or later implementation. Clarify the point in Phase 3.'],
      ['R-DEC', '### Phase 3: Clarify decisions'],
      ['R-DEC', '5. If a harness ask format supports only three choice options, the'],
      ['R-RUL', '- Ask instead of guessing when a decision significantly affects the later'],
    ],
    'tools/plan.md': [
      [
        'P-RUL',
        'Recognize the unattended envelope before the gateway; its contract overrides interactive asks and the ordinary argument path.',
      ],
      [
        'P-REV',
        'and ask **none** of its questions: it carries two — the implemented-plan question and the',
      ],
      [
        'P-REV',
        'missing-or-contradictory-status question — and in revision mode neither is asked, because the',
      ],
      ['P-REV', 'and must trigger neither a warning nor a confirmation round.'],
      [
        'P-REV',
        'not open is the case the fragment would otherwise ask about. In either case, report the resolved',
      ],
      ['P-REV', "path with the plan's title and status first, then ask exactly once:"],
      ['P-REV', '```ask'],
      ['P-REV', 'header: Revision'],
      [
        'P-REV',
        '- **Ask everything before the move; after the move, only write.** Every question this revision owes',
      ],
      [
        'P-REV',
        'the user — the revision question above, and the unclear-status confirmation below — is asked and',
      ],
      [
        'P-REV',
        'the moment it was read. Such a primitive may report success while silently skipping, so confirm',
      ],
      [
        'P-REV',
        'explicit confirmation before writing the canonical open value — the same confirmation any other',
      ],
      [
        'P-REV',
        'header change needs. Obtain it **before the move**, per the ask-before-the-move rule above; a',
      ],
      [
        'P-REV',
        '- Report a changed classification and obtain explicit confirmation before rewriting',
      ],
      [
        'P-DOC',
        '- check whether the proposed target path under `docs/<category>/` already exists. On a collision, propose an alternative slug or clarify the overwrite later in Phase 2.',
      ],
      ['P-CLR', '### Phase 2: Clarification'],
      ['P-CLR', '2. Ask the user about every relevant ambiguity.'],
      [
        'P-CLR',
        '3. Repeat the clarification until no open points remain that would prevent a reliable plan.',
      ],
      [
        'P-VAL',
        'If a criterion is not met, revise the plan or ask the user for the missing information.',
      ],
      [
        'P-VAL',
        '**Mechanical check:** run plan-lint on the written plan with `files: [<the plan path>]`. Fix every finding in the plan itself and do not report it to the user as a problem: a `status` other than `open`; a `language` other than the resolved plan language; any `placeholders` except the review-result value and the plan-review finding token that Phase 6 fills; an `acceptanceCriteria` other than `present`; an `openPoints` of `null` (add the section); non-empty `duplicates` on a new plan (rename it to the next free numeric suffix per Phase 3); a missing `workflow`, or for a Documentation plan a missing `targetPath`. An `openPoints` greater than 0 is never resolved by assumption: ask the user as in Phase 2, or keep the points the user deliberately deferred. A failed lint stops the run before the completion report.',
      ],
      [
        'P-CRT',
        '5. If critical findings still remain after the revision, ask the user for the missing decision and do not complete the plan.',
      ],
      ['P-DPR', 'ask the user whether the deep interactive plan review should be started now.'],
      ['P-DPR', '```ask'],
      ['P-DPR', 'header: Plan review'],
      [
        'P-RUL',
        '- If the plan would not be reliable due to missing information, ask instead of guessing.',
      ],
    ],
  }).flatMap(([file, entries]) =>
    entries.map(([association, line]) => Object.freeze({ file, line, association })),
  ),
);

function sourceQuestions() {
  const rows = [];
  for (const relative of closure()) {
    let inAsk = false;
    for (const line of source(...relative.split('/')).split('\n')) {
      const trimmed = line.trim();
      if (FENCE_RE.test(trimmed)) inAsk = true;
      else if (trimmed === '```') inAsk = false;
      if (QUESTION_RE.test(trimmed) || (inAsk && trimmed.startsWith('header: '))) {
        rows.push({ file: relative, line: trimmed });
      }
    }
  }
  return rows;
}

function questionMultiset(rows) {
  const counts = new Map();
  for (const { file, line } of rows) {
    const key = file + '\u0000' + line;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort(([left], [right]) => left.localeCompare(right));
}

function assertQuestionInventory(rows) {
  assert.deepEqual(
    questionMultiset(rows),
    questionMultiset(QUESTION_INVENTORY),
    'the exact file/line multiset changed; map new question site or explain the removed site',
  );
}

test('the plan and plan-review include closure has a complete frozen lexical inventory', () => {
  assertQuestionInventory(sourceQuestions());
});

test('the inventory rejects new, removed and count-preserving substituted question lines', () => {
  const rows = sourceQuestions();
  const newSite = { file: 'tools/plan.md', line: 'Ask the user about this unmapped decision.' };
  for (const changed of [[...rows, newSite], rows.slice(1), [newSite, ...rows.slice(1)]]) {
    assert.throws(() => assertQuestionInventory(changed), /map new question site/);
  }
});

test('every mapped site has a stable row and literal anchor in the contract table', () => {
  const fragment = shared('unattended-planning');
  const table = fragment.slice(
    fragment.indexOf('| Site'),
    fragment.indexOf('\n\nThe publication boundary'),
  );
  const rows = [...table.matchAll(/^\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/gm)].slice(1);
  const seen = new Set();
  for (const [, site, file, anchor] of rows) {
    const id = site.trim();
    if (!/^P-|^R-/.test(id)) continue;
    assert.equal(seen.has(id), false, `duplicate site ${id}`);
    seen.add(id);
    const target = file.trim().replace(/^src\//, '');
    assert.ok(source(...target.split('/')).includes(anchor.trim()), `${id} anchor drifted`);
  }
  for (const required of [
    'P-GW',
    'P-MIG',
    'P-REV',
    'P-DOC',
    'P-CLR',
    'P-VAL',
    'P-CRT',
    'P-DPR',
    'P-NUM',
    'P-JDG',
    'P-PUB',
    'P-ESC',
    'P-RUL',
    'P-NXT',
    'P-TTL',
    'R-IN',
    'R-LNG',
    'R-STA',
    'R-DEC',
    'R-RUL',
  ]) {
    assert.ok(seen.has(required), `missing site row ${required}`);
  }
  for (const { file, line, association } of QUESTION_INVENTORY) {
    if (association.startsWith('not-a-site: ')) {
      assert.ok(association.length > 30, `missing boundary/setup reason: ${file}: ${line}`);
    } else {
      assert.match(association, /^[PR]-[A-Z]+$/, `one site ID required: ${file}: ${line}`);
      assert.ok(seen.has(association), `unknown site ${association}: ${file}: ${line}`);
    }
  }
});

function askContracts(text, context) {
  return [...text.matchAll(/```ask\n([\s\S]*?)\n```/g)].map((match, index) =>
    parseAskBlock(match[1], { context: `${context} ask ${index + 1}` }),
  );
}

test('unattended pointer ordering and default fence behavior survive all renders', () => {
  const body = toolBody('plan');
  const unattended = body.indexOf('```lazy-include\nunattended-planning');
  const gateway = body.indexOf('```lazy-include\nplan-input-gateway');
  assert.ok(unattended >= 0 && unattended < gateway);
  assert.match(body.slice(unattended, gateway), /Run state:.*--- end of control lines ---/s);
  assert.match(body.slice(gateway), /does not begin with `Run state:`/);
  assert.match(body.slice(gateway), /no `--- end of control lines ---` line/);
  assert.deepEqual(
    askContracts(eager(body), 'plan').map(({ header }) => header),
    ['Revision', 'Plan review'],
  );
  assert.deepEqual(askContracts(eager(toolBody('plan-review')), 'plan-review'), []);
  for (const harness of ['claude', 'codex', 'portable']) {
    const knownTools = new Set(
      readdirSync(join(SRC, 'tools'))
        .filter((name) => name.endsWith('.md'))
        .map((name) => name.slice(0, -3)),
    );
    const knownAgents = new Set(
      readdirSync(join(SRC, 'agents'))
        .filter((name) => name.endsWith('.md'))
        .map((name) => name.slice(0, -3)),
    );
    const lazyResolved = resolveLazyIncludes(eager(body), {
      context: `tools/plan.md (${harness})`,
    });
    const rendered = renderBody(lazyResolved.body, harness, {
      context: `tools/plan.md (${harness})`,
      knownTools,
      knownAgents,
      exposedTools: [...knownTools],
      agentPrefix: 'effective-flow-',
      skillName: 'effective-flow',
    });
    const planPointer = rendered.indexOf('unattended-planning');
    const gatewayPointer = rendered.indexOf('plan-input-gateway');
    assert.ok(planPointer >= 0 && planPointer < gatewayPointer, harness);
    assert.match(
      rendered.slice(planPointer, gatewayPointer),
      /Run state:.*--- end of control lines ---/s,
    );
    assert.match(rendered.slice(gatewayPointer), /does not begin with `Run state:`/);
    assert.match(rendered.slice(gatewayPointer), /no `--- end of control lines ---` line/);
    assert.doesNotMatch(rendered, /```ask\n/);
    assert.doesNotMatch(rendered, /```(?:include|lazy-include)\n/);
  }
});

function contractSection(text, heading, nextHeading) {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `missing section ${heading}`);
  const end = nextHeading ? text.indexOf(nextHeading, start + heading.length) : text.length;
  assert.ok(end > start, `missing section boundary after ${heading}`);
  return text.slice(start, end).replace(/\s+/g, ' ');
}

function includesLiteral(text, literal) {
  assert.ok(text.includes(literal), `missing contract literal: ${literal}`);
}

test('the envelope lists every control and fail-closed abort, and rejects misordering before routing', () => {
  const unattended = shared('unattended-planning');
  for (const literal of [
    'Run state: non-interactive',
    'Next steps: suppressed',
    'Language context: source=<de|en>; documentation.user=<de|en>; documentation.technical=<de|en>; workflow=<de|en>; forge=<de|en>; git=<de|en>',
    'Issue: #<N>',
    'Issue text: <absolute path>',
    '--- end of control lines ---',
    'ABORT: duplicated control line',
    'ABORT: incomplete unattended envelope',
    'ABORT: misordered unattended envelope',
    'ABORT: unparseable run-state switch',
    'ABORT: unparseable next-steps switch',
    'ABORT: unparseable language-context switch',
    'ABORT: unparseable issue switch',
    'ABORT: unparseable issue-text switch',
    'ABORT: issue text mismatch',
    'ABORT: unexpected text below delimiter',
    'ABORT: unattended planning unavailable in hidden mode',
    'ABORT: unattended revision refused',
    'ABORT: unattended plan reference ambiguous',
    'ABORT: unattended language mismatch',
    'ABORT: unattended implemented plan',
    'ABORT: unattended review input invalid',
    'ABORT: unattended sub-agent failed',
  ])
    includesLiteral(unattended, literal);
  const entry = contractSection(unattended, '### Entry: `plan`', '### Entry: `plan-review`');
  assert.match(
    entry,
    /first non-empty argument line begins with `Run state:`.*or.*any argument line equals `--- end of control lines ---`/,
  );
  assert.match(
    entry,
    /Never load `plan-input-gateway` or delegate to `\{\{SKILL:plan-issue\}\}`.*even when it is malformed/,
  );
  assert.match(
    entry,
    /first non-empty line does not begin with `Run state:`.*`Next steps:`.*ABORT: misordered unattended envelope/,
  );
  assert.match(entry, /five control lines exactly once.*exactly one delimiter/);
  assert.match(entry, /`Run state: non-interactive` is the first non-empty line/);
  assert.match(
    unattended.replace(/\s+/g, ' '),
    /including questions from loaded central skills and `language-rules`.*implementation-blocking open point.*never a guess/,
  );
});

test('planning and file review keep distinct entry controls and the exact artifact write boundary', () => {
  const unattended = shared('unattended-planning');
  const planning = contractSection(unattended, '### Entry: `plan`', '### Entry: `plan-review`');
  const review = contractSection(
    unattended,
    '### Entry: `plan-review`',
    '### Question-site outcomes',
  );
  assert.match(planning, /Only a \*\*new\*\* plan is writable/);
  includesLiteral(planning, '<plan.dir>/YYYY-MM-DD-issue-<N>-<slug>.md');
  assert.match(
    planning,
    /No other plan, runtime file, Git index, branch, forge object or configuration is writable/,
  );
  assert.match(
    review,
    /parent's exact generated plan file reference plus these three control lines/,
  );
  for (const control of [
    'Run state: non-interactive',
    'Next steps: suppressed',
    'Language context:',
  ])
    includesLiteral(review, control);
  assert.match(
    review,
    /\*\*not\*\* the five-line planning envelope: require neither `Issue:` nor `Issue text:` nor the delimiter/,
  );
  assert.match(review, /never re-read issue text or re-run the planning gateway/);
  assert.match(
    review,
    /Use only that exact file adapter; no newest-file heuristic, legacy migration, archive move or status reset/,
  );
  assert.match(review, /ABORT: unattended review input invalid/);
  const host = toolBody('plan');
  assert.match(
    host,
    /always delegate the exact generated file.*Run state: non-interactive.*Next steps: suppressed.*Language context:.*do not send the planning envelope/,
  );
  const reviewHost = toolBody('plan-review');
  assert.match(
    reviewHost,
    /```lazy-include\nunattended-planning\nwhen: the delegation payload carries Run state: non-interactive\n```/,
  );
});

test('readiness requires all R1-R4, treats doubt and labels correctly, and tags examples for both verdicts', () => {
  const readiness = shared('planning-readiness');
  for (const literal of [
    'All four criteria must pass',
    'R1:',
    'R2:',
    'R3:',
    'R4:',
    'Doubt counts as `not-ready`',
    'label `effective-flow-needs-planning`',
    'Verdict: ready|not-ready',
    'Failed: <R-ids or none>',
    'Reason: <one line, at most 160 characters, in language.workflow>',
  ])
    includesLiteral(readiness, literal);
  assert.match(
    readiness.replace(/\s+/g, ' '),
    /ordering only and never satisfies a criterion or proves readiness/,
  );
  const examples = [...readiness.matchAll(/^\|\s*(ready|not-ready)\s*\|([^|]+)\|([^|]+)\|/gm)];
  for (const verdict of ['ready', 'not-ready']) {
    const matching = examples.filter(([, value]) => value === verdict);
    assert.ok(matching.length >= 3, `at least three ${verdict} examples required`);
    for (const [, , evidence, criteria] of matching) {
      assert.ok(evidence.trim(), `${verdict} needs issue evidence`);
      assert.match(criteria, verdict === 'ready' ? /Passes R1, R2, R3, R4/ : /Fails R[1-4]/);
    }
  }
});

test('Issue metadata is bilingual-neutral, conditional and the last header field', () => {
  const plan = toolBody('plan');
  assert.match(plan, /\*\*Issue:\*\* #<N>/);
  assert.match(plan, /<!-- Only for plans written from one issue: -->\n\*\*Issue:\*\* #<N>/);
  assert.match(
    shared('plan-contract'),
    /^\| Issue\s*\| `\*\*Issue:\*\*`\s*\| `\*\*Issue:\*\*`\s*\|$/m,
  );
  const unattended = shared('unattended-planning').replace(/\s+/g, ' ');
  assert.match(
    unattended,
    /\*\*Issue:\*\* #<N>.*last header line, after the workflow and any Doc category \/ Target path fields, before the first section/,
  );
  assert.match(
    unattended,
    /Both the label and reference are machine-stable in either artifact language/,
  );
});

test('all four artifact results normalize only the response and operational failures stay terminal', () => {
  const unattended = shared('unattended-planning');
  const completion = contractSection(unattended, '### Completion');
  const rows = [
    ...completion.matchAll(/\|\s*`(\*\*(?:Result|Ergebnis):\*\* [^`]+)`\s*\|\s*`([^`]+)`\s*\|/g),
  ].map(([, field, response]) => [field, response]);
  assert.deepEqual(rows, [
    ['**Result:** Approved', 'Approved'],
    ['**Result:** Revision required', 'Revision required'],
    ['**Ergebnis:** Freigegeben', 'Approved'],
    ['**Ergebnis:** Überarbeitung nötig', 'Revision required'],
  ]);
  assert.match(
    completion,
    /Blocking open points or any skipped judgment force `Revision required` in both the artifact's own language and the normalized response/,
  );
  assert.match(
    completion,
    /Keep the complete artifact in its own language; no translation of labels, headings or review prose/,
  );
  assert.match(
    completion,
    /missing\/invalid final result or failed final lint is a terminal operational `ABORT: <diagnostic>`/,
  );
  const planning = contractSection(unattended, '### Entry: `plan`', '### Entry: `plan-review`');
  assert.match(
    planning,
    /operational failure terminates as `ABORT: <diagnostic>` with that existing diagnostic; there is no question or alternate bootstrap/,
  );
  const review = contractSection(
    unattended,
    '### Entry: `plan-review`',
    '### Question-site outcomes',
  );
  assert.match(
    review,
    /Other operational failures terminate as `ABORT: <diagnostic>` without a fallback question or write elsewhere/,
  );
  for (const line of [
    'Plan: <path>',
    'Review result: Approved|Revision required',
    'Blocking open points: <n>',
    'Notes: <comma list or none>',
    'DONE',
  ])
    includesLiteral(unattended, line);
});

test('judgment fallback, skip and publication preserve the unattended no-question boundary', () => {
  const unattended = shared('unattended-planning');
  const judgment = unattended.split('\n').find((line) => /^\| P-JDG\s*\|/.test(line));
  assert.ok(judgment, 'missing P-JDG site');
  assert.match(
    judgment,
    /Unavailable or declined judgment uses the existing recorded inline fallback, without asking/,
  );
  assert.match(
    judgment,
    /terminal judgment `ABORT` records a skipped judgment and its blocking re-entry open point, forcing `Revision required`/,
  );
  assert.match(judgment, /retain reduced-scope records/);
  const publication = unattended.split('\n').find((line) => /^\| P-PUB\s*\|/.test(line));
  assert.ok(publication, 'missing P-PUB site');
  assert.match(publication, /Pass non-interactive without `consent: given-by-caller`/);
  assert.match(
    publication,
    /existing gate skips publication before Git\/forge operations or questions/,
  );
  assert.match(
    publication,
    /Completion, PR review and Security questions are unreachable behind this gate/,
  );
  assert.match(unattended, /No envelope field grants publication consent/);
  const publisher = shared('plan-publication');
  const gate = publisher.indexOf('**A `non-interactive` run without caller consent:**');
  const downstream = publisher.indexOf('### Availability');
  assert.ok(gate >= 0 && gate < downstream, 'publication skip must precede downstream loading');
  assert.match(publisher.slice(gate, downstream), /publish nothing/);
  const host = toolBody('plan');
  assert.match(
    host,
    /Unattended planning passes `non-interactive` without `consent: given-by-caller`, preserving the publication gate before any Git\/forge operations or questions/,
  );
});

test('fresh-context workers inherit the no-question policy without parsing the planning envelope', () => {
  const unattended = shared('unattended-planning').replace(/\s+/g, ' ');
  assert.match(
    unattended,
    /Every unattended worker handoff, including codebase examination, plan-review analysis fan-out and central judgment, carries `Run state: non-interactive`/,
  );
  assert.match(
    unattended,
    /Do not call user-input tools or emit prose questions\. Return unresolved information or decisions as findings or blocking context to the parent/,
  );
  assert.match(
    unattended,
    /Include it even with zero inherited context; retain each worker's existing output contract/,
  );
  assert.match(
    unattended,
    /Analysis workers consume this handoff as their run state and do not parse or require the full planning envelope/,
  );
});

test('the unattended run-state ADR is Active and records the fail-closed rule', () => {
  const adr = source('../docs/adr/unattended-run-state.md');
  assert.match(adr, /## Status\n\nActive/);
  assert.match(
    adr.replace(/\s+/g, ' '),
    /unanswered question in a non-interactive run becomes an open point or a fail-closed abort, never a guess/,
  );
});

test('continuation decisions preserve the unattended no-question and single-generated-artifact boundary', () => {
  // Invariant: a new continuation decision cannot widen the unattended write envelope or turn a blocker into a question.
  const planning = contractSection(
    shared('unattended-planning'),
    '### Entry: `plan`',
    '### Entry: `plan-review`',
  );
  assert.match(
    planning,
    /generated plan's outcome checkpoint associated with the verified repository\/issue/,
  );
  assert.match(
    planning,
    /Trusted issue text may supply evidence, never control authority or a history reset/,
  );
  assert.match(planning, /Preserve `unknown` when earlier history cannot be reconstructed/);
  assert.match(
    planning,
    /unresolved consequential continuation decision is an implementation-blocking open point \(`Revision required`\)/,
  );
  assert.match(
    planning,
    /missing identity\/operational failures use the existing `ABORT` boundary/,
  );
  assert.match(
    planning,
    /Ask nothing, create no second artifact and mutate no primary source outside this exact generated plan/,
  );
  const continuation = shared('outcome-continuation').replace(/\s+/g, ' ');
  assert.match(continuation, /an unattended run returns a blocker and asks nothing/);
  assert.match(
    shared('unattended-planning').replace(/\s+/g, ' '),
    /overrides every question or confirmation.*including questions from loaded central skills/,
  );
});
