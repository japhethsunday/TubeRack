import { docHandlers } from "@/src/server/docs";

const handlers = docHandlers("compositions");

export const GET = handlers.GET;
export const PUT = handlers.PUT;
