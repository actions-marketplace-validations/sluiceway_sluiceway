# A change says what happens to the real object and, separately, what happens to the tool's record of it

The brief's diff has one `op` with four values. Both tools also emit steps that leave the real object alone and only change what the tool tracks: adopting an existing object, letting go of one that survives, renaming one in state. OpenTofu can combine these with a real change in one step, such as import and update. A flat list of seven ops was rejected because it cannot say that without inventing combined values, and because a "forget" sitting next to "delete" in one list invites a destroy warning on something that is not destroyed.

So every change carries two fields. `op` is what a deploy does to the real object. `tracking` is optional and is what it does to the tool's record of the object.

```ts
type Op = "create" | "update" | "replace" | "delete" | "none";
type Tracking = "import" | "forget" | "move";

interface Change {
  address: string;           // opaque, adapter-defined, unique within the diff
  type: string;              // for display, supplied by the adapter
  name: string;              // for display, supplied by the adapter
  op: Op;
  tracking?: Tracking;
  previousAddress?: string;  // only with tracking "move"
  changedKeys: string[];     // top-level property names, never values
  replaceKeys: string[];     // the changed keys that forced a replace
}

interface Diff {
  stackId: string;
  changes: Change[];
}
```

## Consequences

- A change has an `op` other than `none`, or a `tracking` value, or both. A pure import is `none` with `import`. OpenTofu's import and update is `update` with `import`. Its forget and create is `create` with `forget`, with no special case.
- Every warning about destroyed things reads `op` alone: `replace` and `delete`. A tracking change can never raise one and can never hide one.
- `address` replaces the brief's `urn`. Core sorts, hashes and compares it and never looks inside. What a person sees is `type` and `name`, which the adapter supplies. For Pulumi these are the type token and the logical name, so a URN never reaches the dashboard. Core never builds display text by parsing an address.
- Changed keys are top-level property names. This is the only depth both Pulumi sources can give: `detailedDiff` has paths but is null on create, replace and delete, while `diffReasons` and `replaceReasons` have top-level names only. The Pulumi adapter takes the first segment of each `detailedDiff` path when it is there and `diffReasons` otherwise, so a key means the same thing on an update and on a replace. The cost is that one changed env var and all of them both read as `environment`.
- Creates and deletes list no keys. Address and op are the whole signal.
- A replace carries `changedKeys` and `replaceKeys`, from Pulumi's `replaceReasons` or OpenTofu's `replace_paths`, so the row can say what forced it. `replaceKeys` is empty when the tool gives no reason.
- All folding is the adapter's job. It drops steps that change nothing (`same`, `no-op`, data source reads, refresh steps) and folds both replace orders into `replace`. A step it does not recognise fails that stack's preview and gives a preview failure row. It is never rendered as in sync.
- Row counts such as `+2 ~1 -0` come from `op` only. Changes that have only a tracking change get their own count, so they stay visible.
- The summary counts and the rendered text from the brief leave the type. Both are derived from `changes` by the core (see 0002).
- Not decided here: how to show a change that touches only a stack's outputs. The address is opaque and may name something that is not a resource, so either answer fits this shape.

Research:
- https://github.com/sluiceway/sluiceway/blob/research/opentofu-adapter-fit/docs/research/opentofu-adapter-fit.md
- https://github.com/sluiceway/sluiceway/blob/research/pulumi-cli/docs/research/pulumi-cli.md
