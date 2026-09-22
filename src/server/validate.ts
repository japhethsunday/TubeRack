import { z } from "zod";
import { validationError } from "@/src/server/errors";
import { zodToDetails } from "@/src/server/errors";

/** Parse + validate a JSON body against a schema. Rejects non-JSON safely. */
export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    throw validationError("Request body must be valid JSON.");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw validationError("Invalid request body.", zodToDetails(parsed.error));
  }
  return parsed.data;
}

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().max(64).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().max(200).optional(),
});

export interface Pagination {
  page: number;
  limit: number;
  offset: number;
  sort?: string;
  order: "asc" | "desc";
  search?: string;
}

/** Consistent pagination/filter/sort parsing for every collection route. */
export function parsePagination(url: string | URL, allowedSorts: string[] = []): Pagination {
  const params = new URL(url).searchParams;
  const parsed = paginationSchema.safeParse({
    page: params.get("page") ?? undefined,
    limit: params.get("limit") ?? undefined,
    sort: params.get("sort") ?? undefined,
    order: params.get("order") ?? undefined,
    search: params.get("search") ?? undefined,
  });
  if (!parsed.success) throw validationError("Invalid pagination parameters.", zodToDetails(parsed.error));
  const { page, limit, sort, order, search } = parsed.data;
  if (sort && allowedSorts.length > 0 && !allowedSorts.includes(sort)) {
    throw validationError(`Invalid sort field. Allowed: ${allowedSorts.join(", ")}.`);
  }
  return { page, limit, offset: (page - 1) * limit, sort, order, search };
}

export function pageResponse<T>(rows: T[], total: number, pagination: Pagination) {
  return {
    data: rows,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      pages: Math.max(1, Math.ceil(total / pagination.limit)),
    },
  };
}

/** Route id guard: non-empty, no path traversal, sane length. */
export function parseId(id: string, label = "Resource"): string {
  if (!id || id.length > 128 || id.includes("/") || id.includes("\\") || id.includes("..")) {
    throw validationError(`Invalid ${label.toLowerCase()} id.`);
  }
  return id;
}

export const emailSchema = z.string().trim().min(1, "Email is required.").email("Enter a valid email address.").max(254);
export const passwordSchema = z.string().min(8, "Use at least 8 characters.").max(128);
export const nameSchema = z.string().trim().min(1, "Name is required.").max(80);
