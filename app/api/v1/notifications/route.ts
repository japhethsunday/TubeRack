import { collectionHandlers, itemHandlers } from "@/src/server/rest";
import { notificationConfig } from "@/src/server/resources";

const collection = collectionHandlers({ ...notificationConfig, scopeColumn: "user_id" as const });
const item = itemHandlers({ ...notificationConfig, scope: "user" as const });

// Notifications are created server-side only — no client POST.
export const GET = collection.GET;
export { item };
