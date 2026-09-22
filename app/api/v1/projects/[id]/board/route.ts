import { docHandlers } from "@/src/server/docs";

const handlers = docHandlers("boards");

export const GET = handlers.GET;
export const PUT = handlers.PUT;
