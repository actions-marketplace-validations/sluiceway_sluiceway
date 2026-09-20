# Sluiceway

Sluiceway keeps one GitHub issue, the dashboard, that shows which infrastructure stacks have changes waiting, and deploys a stack when someone ticks its box. This glossary fixes the words used for that.

## Language

### Ticks

**Tick**:
A person checking the box on a stack's row: a request to deploy that stack exactly as the row shows it. A tick is a commit, not a toggle.
_Avoid_: Approval, selection, click

**Ticker**:
The person whose edit made a tick. The only identity a deploy is authorized against and attributed to.
_Avoid_: Approver, actor, sender, deployer

**Orphan tick**:
A tick that nothing picked up, so the box is checked but no deploy exists for it.
_Avoid_: Stale tick, missed tick, lost tick

### Deploys

**Deploy facts**:
What is known about a stack's deploys that a preview cannot recompute: that one is running, how the last one ended, who ticked it, and when.
_Avoid_: State, history, status

**Deployment record**:
One attempt to deploy one stack, from tick to result. The only place deploy facts are kept.
_Avoid_: Deploy log, run, job

**Open deployment**:
A deployment record with no result yet. A stack with one is deploying.
_Avoid_: Pending deployment, active deployment, lock

**Settle**:
To give an open deployment a result when its workflow run ended without reporting one.
_Avoid_: Clean up, time out, expire

### Dashboard

**Row block**:
A stack's complete entry on the dashboard, bounded so it can be moved or replaced as a unit without reading what is inside.
_Avoid_: Entry, item, section

**Failure line**:
The note on a stack's row saying its last deploy failed. It rides on the row wherever the row sits and is not a row state.
_Avoid_: Failed row, failed state, error row
