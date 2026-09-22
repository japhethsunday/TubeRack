import { itemHandlers } from "@/src/server/rest";
import { snapshotConfig } from "@/src/server/resources";

const item = itemHandlers({ ...snapshotConfig, scope: "workspace" as const });

export const GET = item.GET;
export const DELETE = item.DELETE;
