"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/src/lib/api";
import { PageTitle } from "@/src/components/admin/kit";

/** Starts hands-free posting: opens Video Studio on the first promo; the studio works through the rest. */
export default function PromoRun() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const ids = (new URLSearchParams(window.location.search).get("ids") ?? "").split(",").filter((v) => /^[0-9a-f-]{36}$/.test(v)).slice(0, 10);
    if (!ids.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to run.
      setError("No videos to make.");
      return;
    }
    const [first, ...rest] = ids;
    api
      .get<{ promos: { id: string; projectId: string | null }[] }>("/api/v1/admin/promo")
      .then(async (d) => {
        const projectId = d.promos.find((p) => p.id === first)?.projectId ?? (await api.post<{ projectId: string }>(`/api/v1/admin/promo/${first}`, { action: "project" })).projectId;
        const q = new URLSearchParams({ project: projectId, autopost: first });
        if (rest.length) q.set("queue", rest.join(","));
        window.location.assign(`/studio/video?${q}`);
      })
      .catch(() => setError("Couldn't start. Open Promo videos and try again."));
  }, []);
  return (
    <>
      <PageTitle title="Making your videos" sub="Opening Video Studio. Keep the tab open: each video is made and posted to YouTube, then you get the links." />
      {error ? <p className="text-sm text-destructive">{error}</p> : <p className="flex items-center gap-2 text-sm text-muted-text"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Starting…</p>}
    </>
  );
}
