import { docHandlers } from "@/src/server/docs";

const handlers = docHandlers("intel");

export const GET = handlers.GET;
export const PUT = handlers.PUT;
