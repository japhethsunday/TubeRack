"use client";

import { useEffect, useState } from "react";
import { api } from "@/src/lib/api";
import { atLeast, FEATURES, type Feature, type Tier } from "@/src/lib/plans";

let cached: Promise<Tier> | null = null;

/** The signed-in user's plan. null while loading. */
export function usePlan(): Tier | null {
  const [tier, setTier] = useState<Tier | null>(null);
  useEffect(() => {
    let alive = true;
    cached ??= api
      .get<{ tier?: Tier }>("/api/v1/credits/me")
      .then((d) => d.tier ?? "free")
      .catch(() => {
        cached = null;
        return "studio" as Tier; // Never lock someone out because the check failed; the server still enforces.
      });
    void cached.then((v) => alive && setTier(v));
    return () => {
      alive = false;
    };
  }, []);
  return tier;
}

/** Whether the plan includes a feature. null while loading. */
export function useFeature(feature: Feature): boolean | null {
  const tier = usePlan();
  return tier === null ? null : atLeast(tier, FEATURES[feature].tier);
}
