import { collectionHandlers } from "@/src/server/rest";
import { channelConfig } from "@/src/server/resources";

const collection = collectionHandlers({ ...channelConfig, scopeColumn: "workspace_id" as const });

export const GET = collection.GET;
export const POST = collection.POST;
