# The bot is always the workflow's own token

Sluiceway acts on GitHub as one identity, the bot: `github-actions[bot]`, through the `GITHUB_TOKEN` of the workflow run. Every write goes through it: the dashboard, comments, deployment records, the rescan dispatch. There is no supported way to hand Sluiceway a GitHub App token or a personal access token for these writes in v1.

A `token` input that accepts any token is what most actions offer, and it was rejected for three reasons. First, edits made with `GITHUB_TOKEN` start no workflow run, which GitHub documents and the behavior test confirmed, while edits made with any other token do. With another token every re-render would fire `issues.edited`, start a `resolve` run, and take a place in the `queue: max` line in front of real ticks (0005). The loop guard would then be our own code instead of a property of the platform. Second, the dashboard is recognized partly by its author (0009). With the workflow token the author is a constant. An App installation token cannot ask GitHub who it is, so the identity would need a second input, and a dashboard created with a personal token stays editable by that person whatever their role, because an author can always edit their own issue. Third, the workflow token ends with the job and is scoped by the workflow's `permissions:` block. Nothing long-lived has to be stored, which is what promise 1 of 0014 expects.

## Consequences

- The author check of 0009 is a constant: login `github-actions[bot]`, type `Bot`. Nothing is configured and nothing is discovered.
- The bot's power is exactly the `permissions:` block of the example workflow: `contents: read`, `issues: write`, `deployments: write`, `actions: write`. `id-token: write` is added only by users whose credential loading needs OIDC, and only on the jobs that run the tool.
- The budget is 1,000 API requests per hour per repo. Reads stay bounded as in 0003, and any new feature is judged against this budget.
- Nothing Sluiceway writes can start another workflow. A team that wants a message on every deploy adds a step to its own apply job. It cannot hang a workflow on `deployment_status` or on the dashboard's edits.
- Team membership cannot be read with this token, which is one reason teams are left out of the tick rule (0018).
- `resolve` judges the edited issue from the event payload alone: open, carries the configured label, authored by the bot, root marker on the first line. If any of these fails it exits green and silent, without an API call. `issues.edited` fires for every issue in the repo, so this is the common case.
- The example workflow also filters at the job level (`if: contains(github.event.issue.labels.*.name, 'sluiceway')`), so an edit of an ordinary issue starts no runner and takes no place in the line. It is an optimization. The check inside the action is the real one, and a user who changes the label has to change the `if:` too.
- Only `scan` creates or repairs the dashboard, as Renovate does. When several open issues match, the lowest number is the dashboard and the others are closed with a comment that links to it. When no open issue matches but a closed one does, the newest closed match is reopened, which keeps the issue number, the pin and every link. Closing the dashboard is not an off switch. Disabling the workflow is.
- A duplicate can take a tick until the next scan closes it. That is accepted, because deploy safety rests on the deployment record and the hash check, never on which issue was ticked (0004).
- A supported App token can be added later as a new input without breaking anyone. It would bring the identity input and the loop guard with it, and those are the cost that is not paid now.

Research:
- https://github.com/sluiceway/sluiceway/blob/research/github-actions-behaviors/docs/research/github-actions-behaviors.md
- https://github.com/sluiceway/sluiceway/blob/research/renovate-dashboard-mechanics/docs/research/renovate-dashboard-mechanics.md
- Observed payloads: https://github.com/sluiceway/sluiceway/issues/17
