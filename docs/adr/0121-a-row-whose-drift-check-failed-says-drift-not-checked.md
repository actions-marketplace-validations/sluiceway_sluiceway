# A row whose drift check failed says drift not checked

> Amends 0055 (a failed drift check was a warning on the run and nothing on the row) and 0009 (one optional key on the row marker). Built as slice 5.56, with record 0120, for issue 293. Decided by the owner on 2026-10-07.

Record 0055 decided that a drift check that fails leaves the row as the preview made it, with a warning on the run. In the homelab, two stacks fail their check on every scheduled scan, one on a provider error and one on an expired token, and their rows still say plain in sync. The glossary defines in sync as "no known drift", which is true, and it reads as "checked, and nothing drifted", which is not. The owner chose a quiet marker on the row over keeping 0055 as it was.

## Decision

- **The row says `drift not checked`**, after the stack id of an in-sync row and after the counts of a pending one:

  `- network:dev · drift not checked`

  `- [ ] **app:prod** · 1 update · drift not checked · [preview](…)`

  A drifted row never has it: its check worked. A preview that failed gets no drift check (0055), so its row has nothing to say about drift.
- **The marker key `drift-check="failed"`**, after every older key. A parser that does not know it reads the row as before.
- **It is not a state, and not in the hash.** The row keeps its state, its box and its diff hash, so a tick on a pending row with the note approves what it approved before. The header, the counts line and the sections do not change. Nothing is decided from it but one thing below.
- **A push checks it again.** A scan that a push starts checks drift only for the stacks whose row showed drift (0055). A row with the note joins them, so a push that previews the stack checks it again. Without that, a push that touched the stack's files would drop the note without having looked, and it would come back with the next scheduled scan.
- **The next check that works takes it away.** A scan whose check of the stack works draws the row without it. A deploy's row (`apply`) runs no drift check and has no note, as it has no drift (0055). Every other writer carries the row block as it is.
- **The warning on the run says it**: `The drift check of network:dev failed: <reason>. Its row says drift not checked.` The tool's words stay in the stack's group of the job log (0022).

## Consequences

- A repo without drift checks never sees the note or the key.
- A stack whose check fails on every scheduled scan says so on every scan, until its check works or `stacks[].drift.enabled: false` turns the check off for it.
- A push that previews such a stack pays one drift check, as for a stack with known drift.

## Rejected

- **Keeping 0055 as it was.** The warning is on a run that nobody opens when the dashboard looks calm.
- **A state or a section for it.** It is not news about the infrastructure, only about the check, and a red or orange signal for an expired token would be noise on every scheduled scan.
- **The reason on the row.** The reasons are the tool's, from the fixed list of 0022, and the row is meant to stay quiet. The warning and the job log name it.
