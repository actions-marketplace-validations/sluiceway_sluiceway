# pulumi-basic

A small Pulumi repo that needs no cloud account. Sluiceway's own tests record their fixtures from it, and the end to end workflow scans it. It is also a fair picture of what Sluiceway expects to find in a repo.

It uses a local file backend and three providers that need no credentials: `random`, `command` and `local`.

| Directory | Runtime | Stacks | What it shows |
|---|---|---|---|
| `network/` | YAML | `dev`, `prod` | Two stacks in one directory. Their stack ids are `network:dev` and `network:prod`. |
| `app/` | YAML | `prod` | A project file spelled `Pulumi.yml` with the stack file `Pulumi.prod.yml`. The stray `Pulumi.dev.yaml` has the other extension, so Pulumi passes it over and so does Sluiceway. |
| `site/` | TypeScript | `prod` | A program with an install step. |
| `playground/` | YAML | `dev` | A stack that `sluiceway.yaml` ignores. |

`shared/` holds a file that the program in `app/` reads. `sluiceway.yaml` names it under `inputs`, so a push that changes it previews `app:prod` again.

The YAML runtime reads a program only from a file named `Pulumi.yaml` or `Main.yaml`. That is why `app/Pulumi.yml` sets `main: program` and the program is `app/program/Main.yaml`.

## Two strings that must never show up

Every program sets one property to `CANARY-VALUE`, not marked secret, and every stack has the secret config value `CANARY-SECRET`. Sluiceway never shows a property value, marked secret or not. A test runs every recorded preview through Sluiceway and fails if either string comes out anywhere.

The secret config values are encrypted with the passphrase `sluiceway-example`. It is public on purpose. Nothing here is a real secret.

## Try it

You need the Pulumi CLI, v3.229.0 or newer, and Node.js for `site/`.

```sh
export PULUMI_BACKEND_URL="file://$(mktemp -d)"
export PULUMI_CONFIG_PASSPHRASE=sluiceway-example

cd network
pulumi stack init dev
pulumi preview --stack dev
```

For `site/`, run `npm ci` first. A deploy of `network/` writes one file, `network/out/notes.txt`, which git ignores.
