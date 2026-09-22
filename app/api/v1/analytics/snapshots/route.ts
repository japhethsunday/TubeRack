import { collectionHandlers, itemHandlers } from "@/src/server/rest";
import { snapshotConfig } from "@/src/server/resources";

const collection = collectionHandlers({ ...snapshotConfig, scopeColumn: "workspace_id" as const });
const item = itemHandlers({ ...snapshotConfig, scope: "workspace" as const });

export const GET = collection.GET;
export const POST = collection.POST;
export { item };
