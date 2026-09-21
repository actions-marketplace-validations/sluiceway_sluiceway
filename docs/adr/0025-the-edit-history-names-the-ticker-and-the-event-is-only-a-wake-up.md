# The edit history names the ticker, and the event is only a wake-up

> Supersedes 0005.

Record 0005 took a tick from the event whose own diff contains it (unticked in `changes.body.from`, ticked in `issue.body`) and took the ticker from that event's `sender`. A lab test showed that the payload cannot carry that weight. `issue.body` and `issue.updated_at` in an `issues.edited` payload are the newest state at delivery time, not the state right after that edit. Three ticks one second apart gave three events that all carried the final body with all three rows ticked, and the runs did not even queue in edit order. So the first event's diff contains every later tick, and a later ticker's tick is authorized and recorded under the first ticker's name. This can be scripted: a person with plain write access waits for an admin's tick and ticks an `admin` stack within the same second.

GitHub keeps the truth elsewhere: the issue's edit history. GraphQL `userContentEdits` returns one entry per edit with the `editor`, the `editedAt` time and `diff`, which is the full body right after that edit. The workflow token can read it with `issues: read`, and it costs one point. So the roles change. The `issues.edited` event is only a wake-up. `resolve` takes nothing from the payload except the cheap check that the edited issue is the dashboard (0017). It acts on every ticked row it finds, and the history names the ticker of each one.

`resolve` reads the body and the history in one query. For every ticked row it walks the history from the newest entry back, for as long as the row is ticked with the same stack id and hash. The ticker is the editor of the oldest entry in that unbroken stretch: the edit that made the tick. Entries by the bot inside the stretch are normal, because a scan or a row swap carries a tick through. The ticker then passes the test of 0018 unchanged, and their login goes into the deployment payload.

A run acts on a row only when all of these hold: the row is ticked in the body just read, the history names a ticker for it, discovery knows the stack, and the stack has no open deployment. One authorization rule still covers every stack, and nothing deploys without a named ticker.

The history names nobody when an entry inside the stretch has no body (a person with write access can delete an entry's content in GitHub's interface), or when the stretch reaches the end of the kept history without an entry in which the row was not ticked. Then nothing deploys, the box is cleared through the normal row swap with the note that asks for a fresh tick, no comment is written because there is nobody certain to mention, and the job stays green. An entry without a body always breaks the stretch. Skipping over it was rejected: a person who ticks a row they may not deploy, waits for an admin's next edit and then deletes their own entry would otherwise be replaced by that admin.

Since any `resolve` run handles every tick, the runs no longer all have to execute. `resolve` uses plain `concurrency: sluiceway-resolve`, without `queue: max` and without `cancel-in-progress`. A running `resolve` finishes, and only the newest waiting run survives. That run starts after the last edit, so it sees every tick. `apply` keeps its own `queue: max`.

Keeping 0005's shape was considered: find the entry that belongs to this event (its editor is the `sender` and the entry before it equals `from`) and act only on the rows that entry ticked. It was rejected because it compares whole bodies byte for byte, where line endings differ between edits from the interface and from the API, because it fails whenever the entry cannot be matched, and because it keeps a dependence on run order that GitHub does not guarantee. The other candidates were weaker. Refusing a diff with more than one new tick loses the first ticker's tick in every race, since no later event contains it alone. Applying the strictest rule of all newly ticked rows still deploys the second person's row on the first person's rights. The next queued event's `from` cannot be read from another run. Closing the window only for stacks with a narrowed rule was rejected too: who ticked is a deploy fact (0003) and should be right on every stack, and one code path is easier to defend than two.

## Consequences

- A tick has no age limit. A checked box with a nameable ticker is a valid request for as long as it is checked: the ticker is checked live and the hash must still match a fresh preview. A tick whose event was dropped is picked up by the next `resolve` run, whoever's edit woke it.
- Scans still sweep for orphan ticks and still never deploy them. A scan has no business starting a deploy. A row is an orphan when it is ticked, its stack has no open deployment, and no `issues`-triggered run of the workflow is queued or in progress. The scan renders it unticked with a note asking for a fresh tick. If a `resolve` run is still pending, the scan carries the tick through untouched.
- A tick is a commit, not a toggle. Unticking after `resolve` has created the record does not stop the deploy.
- Staleness is covered by reading the body at run time. An untick before the run starts, a re-run of an old workflow run, or a row whose hash changed all fall out as nothing to do. A replayed payload cannot matter, because nothing is taken from it.
- The walk reads row markers only (0009). It never compares whole bodies, so line endings and edits elsewhere in the body do not matter.
- The body and the history come from one query, so they describe one moment. If the newest entry's body is not the body that was read, `resolve` reads again.
- GitHub keeps 100 entries: the original body and the newest 99 edits. A walk that reaches the gap names nobody. With bot writes from every scan and deploy in the same history, that takes a tick that stayed unhandled through 99 later edits.
- Each entry carries a full body, up to 262,144 bytes. `resolve` reads the history in small pages, newest first, and stops as soon as every ticked row has its answer. One page is the normal case.
- An oldest entry whose editor is not a person falls under 0018: no deploy, no comment, and the next scan clears the box.
- The rescan box gets its ticker the same way.
- Replaced `resolve` runs show as cancelled in the Actions list. That is GitHub's way of showing a waiting run that a newer one made unnecessary. Ten quick ticks cost two or three runs instead of ten, which matters on a small pool of self-hosted runners.
- An edit through the API that ticks several boxes at once is one entry, so every one of those ticks has the same ticker, and each is judged on its own (0018).
- The `permissions:` block does not change. `issues: write` already covers reading the history.
- Not tested: what a deleted entry looks like through the API. GitHub's docs say the editor and the time stay and the content goes. The rule does not depend on it, because any entry without a body breaks the stretch.

Research:
- Observed entries, the reproduced race and the history cap: https://github.com/sluiceway/sluiceway/issues/28
- The payload finding: https://github.com/sluiceway/sluiceway/issues/27
- https://github.com/sluiceway/sluiceway/blob/research/renovate-dashboard-mechanics/docs/research/renovate-dashboard-mechanics.md
