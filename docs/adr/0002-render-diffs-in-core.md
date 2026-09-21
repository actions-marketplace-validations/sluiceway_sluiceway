# Sluiceway renders the diff itself from the normalized diff

`pulumi preview --json` replaces the human-readable output, so one run cannot give both. Instead of running every preview twice, the core renders the "Show changes" text from the same normalized diff that is hashed. The `rendered` field from the original brief leaves the adapter interface; rendering is the core's job.

We picked this over a second `--diff` run because the text a person approves and the hash then come from the same data, the output is deterministic (Pulumi's text output is not), we decide exactly what is shown instead of scrubbing secrets out of free text we do not control, the size is ours to budget, and any later adapter gets the same look for free. The cost is that the diff does not look exactly like Pulumi's own. The job summary can carry the tool's native output for anyone who wants it.

Whether values are ever shown, or only property names, is decided separately.

Decided in 0021: property names only, and the job summary does not carry the tool's native output after all.
