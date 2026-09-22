import { itemHandlers } from "@/src/server/rest";
import { renderRequestConfig } from "@/src/server/resources";

const item = itemHandlers({ ...renderRequestConfig, scope: "project" as const });

export const GET = item.GET;
export const PATCH = item.PATCH;
export const DELETE = item.DELETE;
