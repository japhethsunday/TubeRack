import { collectionHandlers, itemHandlers } from "@/src/server/rest";
import { perfEntryConfig } from "@/src/server/resources";

const collection = collectionHandlers({ ...perfEntryConfig, scopeColumn: "project_id" as const });
const item = itemHandlers({ ...perfEntryConfig, scope: "project" as const });

export const GET = collection.GET;
export const POST = collection.POST;
export { item };
