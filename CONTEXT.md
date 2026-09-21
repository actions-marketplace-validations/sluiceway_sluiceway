# Sluiceway

Sluiceway keeps one GitHub issue, the dashboard, that shows which infrastructure stacks have changes waiting, and deploys a stack when someone ticks its box. This glossary fixes the words used for that.

## Language

### Stacks

**Stack**:
The smallest thing Sluiceway can preview and deploy on its own. It has its own state, one row on the dashboard and one checkbox. This is Sluiceway's word, not a tool's: a Pulumi stack is a stack, and so is an OpenTofu root module with a chosen workspace and var files. Not every stack is a Pulumi stack.
_Avoid_: Unit, project, workspace, module, target

**Stack id**:
The one string that names a stack everywhere: on its row, on its deployment records and in config. It is derived from where the stack lives and what it is called, never chosen, so a stack that is moved or renamed is a new stack.
_Avoid_: Stack name, slug, key

### Scans

**Scan**:
One pass that previews stacks and brings the dashboard up to date with the results. Every scan ends with exactly one row for every stack.
_Avoid_: Run, refresh, sync, plan

**Full scan**:
A scan that previews every stack.
_Avoid_: Complete scan, deep scan, rescan (that is the checkbox that asks for one)

**Narrowed scan**:
A scan that previews only the stacks that claim a file changed since the last scan, and keeps every other stack's row as it is. It is a full scan whenever a changed file has no claimant.
_Avoid_: Partial scan, incremental scan, affected scan, changed stacks

**Claim**:
A stack claims a changed file when the file lies inside the stack's directory or matches one of the inputs configured for that stack. Several stacks can claim one file.
_Avoid_: Affects, owns, touches, depends on

### Diffs

**Diff**:
What deploying one stack would change, told as addresses, ops, tracking changes and the names of changed properties. Never values.
_Avoid_: Plan, preview output, changeset

**Pending**:
Deploying the stack now would change something, because the code moved.
_Avoid_: Out of sync, dirty, changed

**Drift**:
A change made to real infrastructure outside the code. It is shown on the stack's own row, never on a second row.
_Avoid_: Out-of-band change, skew

**In sync**:
Nothing to deploy and no known drift.
_Avoid_: Clean, up to date, green

**Diff hash**:
A fingerprint of everything a stack's row shows about what a deploy would change. A tick approves that fingerprint, and a deploy goes ahead only if a fresh preview still gives the same one.
_Avoid_: Checksum, signature, plan id

**Address**:
The string that identifies one resource within one stack's diff. The tool's adapter defines it and nothing else looks inside it. It is unique within a diff and the same across two identical previews.
_Avoid_: URN, resource id, id

**Op**:
What a deploy would do to one real object: create, update, replace, delete, or nothing. Warnings about destroyed things depend on the op alone.
_Avoid_: Action, step, operation

**Tracking change**:
What a deploy would do to the tool's record of an object while the object itself is left alone: start tracking it (import), stop tracking it (forget), or track it under a new address (move). It can come with an op or on its own.
_Avoid_: State change, state-only op, no-op

### Ticks

**Tick**:
A person checking the box on a stack's row: a request to deploy that stack exactly as the row shows it. A tick is a commit, not a toggle.
_Avoid_: Approval, selection, click

**Ticker**:
The person whose edit made a tick. The only identity a deploy is authorized against and attributed to. Always a person, never a bot.
_Avoid_: Approver, actor, sender, deployer

**Tick rule**:
What a person needs in order to tick a stack: a level of access to the repo, or a place on a list of named people who also have write access. It can narrow who may tick, never widen it.
_Avoid_: Approvers, reviewers, allowlist, access list

**Refused tick**:
A tick by a person the stack's tick rule does not allow. Nothing deploys, the box is cleared and the person is told why.
_Avoid_: Unauthorized tick, rejected tick, denied tick

**Orphan tick**:
A tick that nothing picked up, so the box is checked but no deploy exists for it.
_Avoid_: Stale tick, missed tick, lost tick

**Reviewer**:
A person who approves a waiting deploy in GitHub's own interface, where the repo's plan offers that. A second gate after the tick, owned by GitHub. Sluiceway only waits for it.
_Avoid_: Approver, second ticker

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

**Outside deploy**:
A deploy of a stack that did not go through a tick: from a laptop, a script or another pipeline. It is allowed, leaves no deployment record, and the next full scan brings the row back in line.
_Avoid_: Manual deploy, rogue deploy, out-of-band deploy

### Credentials

**Tool environment**:
Everything the infrastructure tool needs in order to run: credentials, the state backend, settings. The user's workflow prepares it before Sluiceway starts, and Sluiceway hands it to the tool whole without looking inside.
_Avoid_: Secrets, env config, credentials config

### Dashboard

**Bot**:
The one GitHub identity Sluiceway acts as. It creates and edits the dashboard, writes comments and records deploys. It is never a ticker.
_Avoid_: App, service account, Sluiceway user

**Row block**:
A stack's complete entry on the dashboard, bounded so it can be moved or replaced as a unit without reading what is inside.
_Avoid_: Entry, item, section

**Row state**:
Which group a stack's row belongs to: pending, deploying, in sync or preview failed. It is a label for placing and counting rows. Nothing about a deploy is ever decided from it. A scan may read it for one thing only: to pick stacks worth previewing again.
_Avoid_: Status, stack state, phase

**Preview failure**:
A stack whose preview did not produce a diff. Its row has no checkbox and links to the run that failed. One stack's preview failure never stops the others.
_Avoid_: Error row, broken stack, failed stack

**Failure line**:
The note on a stack's row saying its last deploy failed. It rides on the row wherever the row sits and is not a row state.
_Avoid_: Failed row, failed state, error row
