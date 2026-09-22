import { itemHandlers } from "@/src/server/rest";
import { retentionNoteConfig } from "@/src/server/resources";

const item = itemHandlers({ ...retentionNoteConfig, scope: "project" as const });

export const GET = item.GET;
export const PATCH = item.PATCH;
export const DELETE = item.DELETE;
