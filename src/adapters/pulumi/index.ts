import type { Adapter } from "../adapter.ts";
import { discover } from "./discover.ts";

export const pulumi: Adapter = { discover };
