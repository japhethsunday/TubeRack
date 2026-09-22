import { itemHandlers } from "@/src/server/rest";
import { channelConfig } from "@/src/server/resources";

const item = itemHandlers({ ...channelConfig, scope: "workspace" as const });

export const GET = item.GET;
export const PATCH = item.PATCH;
export const DELETE = item.DELETE;
