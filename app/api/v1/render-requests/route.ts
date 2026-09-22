import { collectionHandlers, itemHandlers } from "@/src/server/rest";
import { renderRequestConfig } from "@/src/server/resources";

const collection = collectionHandlers({ ...renderRequestConfig, scopeColumn: "project_id" as const });
const item = itemHandlers({ ...renderRequestConfig, scope: "project" as const });

export const GET = collection.GET;
export const POST = collection.POST;
export { item };
