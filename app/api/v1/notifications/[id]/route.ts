import { itemHandlers } from "@/src/server/rest";
import { notificationConfig } from "@/src/server/resources";

const item = itemHandlers({ ...notificationConfig, scope: "user" as const });

export const GET = item.GET;
export const PATCH = item.PATCH;
export const DELETE = item.DELETE;
