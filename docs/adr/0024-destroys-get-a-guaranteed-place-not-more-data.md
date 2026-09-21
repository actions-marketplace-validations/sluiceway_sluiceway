# A replace or delete gets a guaranteed place on the row, not more data

A person judging a replace or a delete wants to know more than for an update: why is my database being replaced? The tempting answer is to show values for destroys only, such as the old and new value of the property that forced a replace. That was rejected. It is the one exception that brings back every risk in 0021, on exactly the rows people read most closely, and the hash would then cover values on some changes and not on others.

What a destroy gets is priority. The data is what 0007 already carries: a replace names the changed properties and which of them forced the replace, a delete shows type and name. The rule is about never losing that under pressure from the size budget, from truncation or from redact.

## Consequences

- Inside a row's details, changes are listed destroys first: deletes, then replaces, then everything else, each group sorted by address. Output stays deterministic.
- The size budget cuts destroys last. This corrects the brief, which truncates per stack diffs without looking at what is in them. When a row's details have to shrink, creates, updates and tracking changes go first and are replaced by one line that says how many are hidden and links to the summary. Replace and delete lines are cut only when the row cannot fit otherwise, and then the row says how many destroys are hidden, in the warning itself.
- A row is never reduced to a bare count while it hides a destroy without saying so. Every row with a replace or a delete carries the warning on every level of truncation and under redact (0023). The counts on the first line always include replaces and deletes as their own numbers.
- A replace line always shows its `replaceKeys` when the tool gave any. Keys are never dropped from a replace line to save space: the line is cut whole or shown whole.
- The warning reads `op` alone (0007), so a tracking change such as forget never raises one and never hides one.
- No personality on these rows, as the map already says. The wording of the warning and how it looks belong to the dashboard prototype. This record only fixes what must survive.
- If values are ever shown (0008, 0021), they arrive for every op by one rule. Destroys do not get them first.
