# Duplicate-return behavioral finding

Verdict: FAIL. Important / P2, current implementation scope.

A stale child return repeats already evaluated continuation-2 after resume with no new attempt and no new evidence. The model recognizes the duplicate, then actually updates the plan. Its diff appends replay narration to Last evaluated attempt and replaces the beginning of Evidence delta. Count 2 and allowance/remaining 2 remain intact, but preserving those tokens does not satisfy the accepted no-overwrite invariant.

The prior local-second after-source is byte-identical to the duplicate before-source. The actual ordered duplicate trace recognizes the already evaluated attempt at event 12, completes a file_change at event 16, and subsequently verifies selected tokens rather than unchanged bytes. The final report explicitly says the checkpoint was updated. This is a completed behavioral failure, not invalid evidence. The preceding local-second trace records the inline reassessment before its source mutation, and the duplicate retains that decision.

The focused correction belongs in the single outcome-continuation owner fragment: a reconciled already-evaluated duplicate/resumed return with no new evidence or separately authorized reconciliation must leave the whole persisted checkpoint unchanged. Report the ignored replay only in the existing return/handoff. Explicitly preserve last attempt and decisive evidence as well as counter, decision and allowance. Keep existing uncertainty and fresh-source reconciliation rules for genuinely different evidence; do not block legitimate source changes or add another state mechanism.

Keep the strict byte-preservation acceptance check. A changed production contract requires a new build, new source-bound recommendation round and fresh source-exercise root. Do not treat the failed completed session as aborted or weaken the invariant. The existing 20 recommendation reports remain positive historical evidence for their original freeze, proving choice only; they do not satisfy this persistence criterion.

Only local-duplicate and its direct local-second predecessor were reviewed for this bounded addition. No claim covers all 22 planned contexts, a whole workflow or production continuity. No production, test, round, seal or exercise file was changed by this review.
