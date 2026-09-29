"use client";

import { useEffect, useState } from "react";
import { api } from "@/src/lib/api";

/** Whether the signed-in user's plan includes paid features (AI video). null while loading. */
let cached: Promise<boolean> | null = null;

export function usePaid(): boolean | null {
  const [paid, setPaid] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    cached ??= api
      .get<{ paid?: boolean }>("/api/v1/credits/me")
      .then((d) => Boolean(d.paid))
      .catch(() => {
        cached = null;
        return false;
      });
    void cached.then((v) => alive && setPaid(v));
    return () => {
      alive = false;
    };
  }, []);
  return paid;
}
