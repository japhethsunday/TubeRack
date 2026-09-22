import { itemHandlers } from "@/src/server/rest";
import { opportunityConfig } from "@/src/server/resources";

const item = itemHandlers({ ...opportunityConfig, scope: "workspace" as const });

export const GET = item.GET;
export const PATCH = item.PATCH;
export const DELETE = item.DELETE;
