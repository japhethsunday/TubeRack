import { collectionHandlers, itemHandlers } from "@/src/server/rest";
import { signalConfig } from "@/src/server/resources";

const collection = collectionHandlers({ ...signalConfig, scopeColumn: "workspace_id" as const });
const item = itemHandlers({ ...signalConfig, scope: "workspace" as const });

export const GET = collection.GET;
export const POST = collection.POST;
export { item };
