import { collectionHandlers, itemHandlers } from "@/src/server/rest";
import { opportunityConfig } from "@/src/server/resources";

const collection = collectionHandlers({ ...opportunityConfig, scopeColumn: "workspace_id" as const });
const item = itemHandlers({ ...opportunityConfig, scope: "workspace" as const });

export const GET = collection.GET;
export const POST = collection.POST;
