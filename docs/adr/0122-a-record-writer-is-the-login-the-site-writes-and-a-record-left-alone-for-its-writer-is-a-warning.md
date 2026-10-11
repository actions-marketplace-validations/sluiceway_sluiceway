# A record writer is the login the site writes, and a record left alone for its writer is a warning

> Amends 0109 (the creator of a record is read from the GraphQL page as the site writes it, and a record whose creator `recordWriters` does not name is a warning on the run, not a line of the job log). Decided by the owner on 2026-10-11.

The Sluiceway app opens deployment records for the command line (0116) and dispatches the workflow, and the configs list it in `recordWriters` as `sluiceway[bot]`, as 0109 says an app is written. Every tick from the command line ended as `the run ended without a result`. The job log of each run said `Deployment record … names this run, and sluiceway opened it, who is not in recordWriters. It is left alone.`

GitHub names an app two ways. REST and the site write `sluiceway[bot]`; GraphQL writes `sluiceway`, with `__typename` `Bot` (seen on 2026-10-11 against a public repo whose app opens deployments: GraphQL `next-js-bot`, REST `next-js-bot[bot]` for the same record). `resolve` reads its records from the GraphQL page of 0003, so the creator it compared was the bare name and never matched. Record 0026 met the same gap for the author of a pull request and fixed it in the port; the deployment page had not.

## Decision

- **The port reads the creator as the site writes it.** The GraphQL page asks for `__typename` with the creator's login, and a `Bot` whose login lacks `[bot]` gets it, as the pull request author does (0026). REST already writes it so. `resolve` keeps comparing the login exactly, in lower case, against the list: a person and an app of the same name are two accounts, and a person named `sluiceway` must not pass as the app `sluiceway[bot]`.
- **A record left alone for its writer is a warning on the run.** A record that names the run and that GitHub names nobody for, or a login the list does not name, gets the annotation `Deployment record left alone`, which names the creator and the logins the list holds. A writer whose every record is left alone sees each of its runs end without a result, and the reason has to be where a person looks, not only in the job log. A record left alone because the list is empty stays a line of the log: such a repo behaves as before 0109.

## Consequences

- A config that lists an app as `name[bot]` now hands on that app's records.
- A record of an unlisted writer puts a warning on the run that names who opened it.

## Rejected

- **Matching the bare name too, in `resolve`.** It works for the app and lets a person whose login is the app's name open records as the app. The port knows which one GitHub means, so the port says it.
- **Writing the app as the bare name in the config.** 0109, the config reference and the check all write an app as `name[bot]`, as GitHub does everywhere a person reads it.
