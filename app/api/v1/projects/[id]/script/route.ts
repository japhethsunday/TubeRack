import { docHandlers } from "@/src/server/docs";

const handlers = docHandlers("scripts");

export const GET = handlers.GET;
export const PUT = handlers.PUT;
