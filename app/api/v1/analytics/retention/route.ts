import { collectionHandlers, itemHandlers } from "@/src/server/rest";
import { retentionNoteConfig } from "@/src/server/resources";

const collection = collectionHandlers({ ...retentionNoteConfig, scopeColumn: "project_id" as const });
const item = itemHandlers({ ...retentionNoteConfig, scope: "project" as const });

export const GET = collection.GET;
export const POST = collection.POST;
export { item };
