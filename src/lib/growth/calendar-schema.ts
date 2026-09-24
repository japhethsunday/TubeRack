import { z } from "zod";

const ymd = /^\d{4}-\d{2}-\d{2}$/;

export const itemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(["idea", "script", "record", "edit", "thumbnail", "publish", "promote", "other"]).default("publish"),
  date: z.string().regex(ymd, "Use YYYY-MM-DD."),
  time: z.string().regex(/^(\d{2}:\d{2})?$/).default(""),
  status: z.enum(["planned", "done", "skipped"]).default("planned"),
  notes: z.string().max(2000).default(""),
  remind: z.boolean().default(true),
  projectId: z.string().max(100).nullable().default(null),
});
