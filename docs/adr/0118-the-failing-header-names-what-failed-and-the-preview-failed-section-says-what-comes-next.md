# The failing header names what failed, and the Preview failed section says what comes next

> Amends 0031 and 0066 (the alt text of the failing header), 0029 (the line above the preview failures). Built as slice 5.54, with record 0117, for onboarding log hurdle 30.

The dashboard of onboarding log hurdle 30 had one failed preview among 54 stacks. Where the picture does not load, or loads late, and in a screen reader, the header is its alt text, and it read `Sluiceway: something failed`. Above the one row stood `These stacks could not be previewed, so they cannot be deployed from here until a scan succeeds.` Both are true and both read worse than what happened: "something" is as large as the reader fears, "these stacks" was one stack, and "until a scan succeeds" names no next step.

Record 0117 takes most such rows off the dashboard. This record is about the words for the ones that stay.

## Decision

- **The alt text of a failing header says what failed and how many**, in the numbers the counts line under it shows: the preview failures and the rows with a failure line.
  - `Sluiceway: 1 preview failed`, `Sluiceway: 2 previews failed`
  - `Sluiceway: 1 deploy failed`, `Sluiceway: 3 deploys failed`
  - `Sluiceway: 2 previews and 1 deploy failed`

  What follows it stays as records 0066 and 0075 have it: `, 9 stacks are pending`, `, some changes delete or replace resources`, and since 0117 `, 1 stack is busy`.
- **The picture is the same jam, and its own label stays `Sluiceway: something failed`.** One file serves any number of failures, so the label inside the file cannot count them. The dashboard writes the alt text, which is what a reader gets in place of the picture.
- **The line above the preview failures counts its rows and says what comes next**:
  - one row: `This stack could not be previewed, so it cannot be deployed from here until a scan previews it. Every scan tries it again, and the run on its row holds the tool's own words.`
  - more: `These stacks could not be previewed, so they cannot be deployed from here until a scan previews them. Every scan tries them again, and the run on each row holds the tool's own words.`

  Every part is a fact the records already hold: no box on such a row (0012), every scan previews it, a narrowed one too (0010), and the row links the job whose log holds the tool's words (0022, 0044).
- **The row keeps its words**: `preview failed: <reason from the fixed list> · [run](…)`. It is the honest part, and 0117 made it rarer. The header stays failing, the dot stays red and the count stays `1 preview failed`: a stack that failed twice in one scan is a thing to look at.
- **Both lines are plain**, like every line but the two of record 0032.

## Rejected

- **A calmer header state for a single preview failure**, such as the pending or in sync picture with a note. Bad news wins (0031), and a stack that cannot be deployed from here is bad news for whoever wants to deploy it. The words were the problem, not the state.
- **Naming the stack in the alt text.** It is one line under the picture already, and an alt text that grows with the number of failures stops being one.
- **"Tried twice" on the row.** True for most rows since 0117 and not for all: a reason that a second run cannot change is not tried again. The warning on the run says which it was.

## Consequences

- The snapshots of every failing body change in the alt text and the line.
- A body that another writer regenerates (0009) gets the new words from the markers, as it got the old.
