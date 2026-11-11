# Reviewed narration edits and saved revisions

The Script tab now requires an explicit impact review before saving narration. Leaving a text box no longer saves it. Unsaved narration prevents script approval until the draft is saved or reset. This is the first part of the precise-edit roadmap; a general shot inspector, label editor and selective regeneration planner are not implemented by this workflow.

## Review and save

Edit an unapproved scene, select **Review edit impact**, then **Save reviewed change**. The preview shows:

- The scene whose voice record will be invalidated and other scene voice records that remain available.
- The edited scene and following scenes whose absolute timing may change, plus the edited scene's existing shot IDs.
- Stages reopened from voice through final review. The actual completion markers cleared are computed with the same mutation function used to apply the edit.
- Preserved concept selections and archive choices requiring review when shot planning reruns.
- A general estimate for the affected whole stages, using the existing estimate engine. Missing provider information is shown as unknown. This is not a measured delta, exact quote, cache-hit guarantee or billing reservation.

Saving changes metadata only and starts no agent, voice, image or rendering job. A changed narration deletes only that scene's voice record, removes the working timeline, clears the preview approval and reopens dependent completion markers. Other scene audio, concept selections and the previous rendered export/source report remain available. An identical trimmed narration is a no-op and creates no history.

Shot planning still runs at episode scope. In the non-vector pipeline it rebuilds shot frames and clips; vector planning may reuse compatible scene and asset caches. Archive choices are reconsidered after planning. Preserving concept drawings does not promise that every shot image survives a later run. Review the newly planned shots before rendering. Source reviews in the working [claim register](CLAIM_SOURCES.md) become stale when their scene narration changes; frozen export evidence is preserved.

The preview contains a fingerprint of the full persisted episode. The Studio sends it with the save. If another edit, approval, setting change or production update intervenes, the server rejects the stale application. Draft text stays in the editor so it can be reviewed again. A late preview response cannot publish after its scene's server text or enabled state changes. Clean editor text follows a restored revision; a dirty local draft is preserved.

## Undo a saved revision

The latest edit pointer is a small optional field in episode state. **Review undo of last narration edit** loads the old narration on demand. **Restore saved previous revision** restores the exact episode state captured before that edit, including prior voice records and completion markers. The pointer survives a Studio restart and can step back through consecutive unchanged edit revisions.

Undo requires the current episode fingerprint to match the saved edit's resulting state. Any intervening production or metadata change prevents undo; it cannot roll back paid production that has since occurred. It does not remove media files, edit history, the ledger or the separate research register. A corrupt or cross-episode revision is rejected. These hashes detect inconsistent records; they are not independent signatures.

```text
episodes/<id>/edits/<uuid>.json
```

Each history record contains the complete previous episode state and before/after fingerprints. It is written before publishing the changed state. A failed state write leaves the prior episode intact and may leave an unused history record. History is retained, so large embedded timelines can make individual records large; it is not added to Studio polling responses. Existing episode deletion already covers this prefix. Old episodes need no migration.

## API and ownership

`POST /api/episodes/<id>/edits` accepts `{type:"preview", sceneId, narration}` or `{type:"undo-preview", editId}`. Both are read-only and return `Cache-Control: no-store`; undo previews never expose the full stored previous state.

The existing action route accepts `edit-narration` with the reviewed `fingerprint`, or `undo-narration-edit` with `editId` and `fingerprint`. For compatibility, older narration clients can omit the fingerprint; they still acquire the producer lock but do not receive optimistic preview protection. New Studio code always sends it. Narration must be nonempty and at most 20,000 characters.

Save and undo acquire the episode producer lock around their complete read/check/write operation. `EpisodeRepo.update` now does the same, as do direct Studio asset decisions and character reuse. Follow-up jobs start after the mutation lock is released. This closes the older human-write path that could otherwise overlap a reviewed edit or a producer. Direct callers of low-level `repo.save` remain responsible for ownership; this change does not introduce a global transaction layer.

## Verification

Two defects were reproduced before patching: narration edits retained stale completion flags (and identical edits discarded audio), and human `repo.update` wrote while another owner held the producer lock. Their original proofs and three consecutive independent verifiers are in `.temp_files/prove_F1_narration-edit.ts`, `verify_F1_narration-edit.ts`, `prove_F2_edit-lock.ts` and `verify_F2_edit-lock.ts`. The audit ledger is `.temp_files/ledger_narration-edits.md`.

Focused tests cover exact restoration after reload, consecutive undo, stale previews, intervening production, corrupt history, write failures, producer exclusion, no-op edits and invalid inputs. A pipeline test resumes through voice with mocked providers and proves that only the edited scene requests synthesis; unchanged audio and the prior render survive. Component tests cover explicit review, failed application, stale response order, local draft retention, undo and unsaved-approval blocking. They do not establish visual layout quality. No paid provider call or new authored episode delivery is part of this verification.

On 11 November 2026, root/Studio typecheck and the optimized Studio build passed. The six focused files passed 178 tests. The full `pnpm.cmd test --maxWorkers=2` run passed 178 files and 1,939 tests, with one PostgreSQL/RustFS integration file and its two tests skipped. The existing Socket listener warning remained; no memory-leak conclusion is drawn. Coverage was not measured, and no standalone lint/format script is configured.

A production Studio server pointed at `.temp_files/narration-edit-workflow-2026-11-11` passed the HTTP preview → apply → stale rejection → undo sequence. It restored the exact saved episode state and preserved the SHA-256 of the existing synthetic four-second MP4, the frozen research report and the working research book. No new render was performed. Evidence: `narration-http-verification.json` inside that fixture. The isolated server was stopped after verification. Browser layout inspection and live S3 compatibility were not performed.
