"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/src/components/ui/overlays";
import { Button } from "@/src/components/ui/Button";
import { Input, Textarea, Select } from "@/src/components/ui/fields";
import { LocalStorageNote, useProjects } from "@/src/components/projects/ProjectsProvider";
import { CONTENT_TYPES, PLATFORMS } from "@/src/lib/projects/types";
import { useRouter } from "next/navigation";
import { growth } from "@/src/lib/growth-client";

const YT = "yt:connected";

/**
 * Real project creation against device-local storage. Leaves explicit room
 * for Phase 5 intelligence (idea/topic/audience/goal feed strategy).
 */
export function NewProjectButton({ label = "New project" }: { label?: string }) {
  const { channels, addChannel, create } = useProjects();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [contentType, setContentType] = useState<(typeof CONTENT_TYPES)[number]>("Long-form video");
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>("YouTube");
  const [channelId, setChannelId] = useState("");
  const [newChannel, setNewChannel] = useState("");
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [ytChannel, setYtChannel] = useState<string | null>(null);

  // Offer the connected YouTube channel (and pre-select it) every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void growth.connection().then((o) => {
      if (cancelled || !o.ok || !o.data.connection) return;
      const title = o.data.connection.channelTitle;
      setYtChannel(title);
      const existing = channels.find((c) => c.name.trim().toLowerCase() === title.trim().toLowerCase());
      setChannelId((cur) => cur || (existing ? existing.id : YT));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function reset() {
    setName("");
    setTopic("");
    setDescription("");
    setGoal("");
    setNewChannel("");
    setError(undefined);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give the project a name.");
      return;
    }
    if (!topic.trim()) {
      setError("Describe the topic or idea — research and strategy build on it.");
      return;
    }
    let cid = channelId;
    if (cid === YT && ytChannel) {
      // First project on the connected channel: create its app channel once, then reuse it.
      const existing = channels.find((c) => c.name.trim().toLowerCase() === ytChannel.trim().toLowerCase());
      cid = existing ? existing.id : addChannel(ytChannel, "YouTube").id;
    }
    if (!cid) {
      if (newChannel.trim()) {
        cid = addChannel(newChannel.trim(), "").id;
      } else if (channels.length > 0) {
        cid = channels[0].id;
      } else {
        cid = addChannel("My channel", "").id;
      }
    }
    const project = create({
      name: name.trim(),
      contentType,
      platform,
      channelId: cid,
      topic: topic.trim(),
      description: description.trim(),
      goal: goal.trim(),
    });
    setOpen(false);
    reset();
    router.push(`/projects/${project.id}`);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        {label}
      </Button>
      {open && (
        <Modal
          title="New project"
          description="An idea with a pipeline attached. Research, strategy, and AI build on the topic."
          onClose={() => setOpen(false)}
          wide
        >
          <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input label="Project name" value={name} onChange={(e) => setName(e.target.value)} error={error && !name.trim() ? error : undefined} placeholder="Why hooks fail in the first 8 seconds" />
            </div>
            <Select label="Content type" value={contentType} onChange={(e) => setContentType(e.target.value as typeof contentType)}>
              {CONTENT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
            <Select label="Target platform" value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)}>
              {PLATFORMS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
            <Select label="Channel" value={channelId} onChange={(e) => setChannelId(e.target.value)} hint="Or create one below.">
              <option value="">Select…</option>
              {ytChannel && !channels.some((c) => c.name.trim().toLowerCase() === ytChannel.trim().toLowerCase()) && (
                <option value={YT}>{ytChannel} (connected YouTube)</option>
              )}
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {ytChannel && c.name.trim().toLowerCase() === ytChannel.trim().toLowerCase() ? " (connected YouTube)" : ""}
                </option>
              ))}
            </Select>
            <Input label="New channel (optional)" value={newChannel} onChange={(e) => setNewChannel(e.target.value)} placeholder="Studio Ada" />
            <div className="sm:col-span-2">
              <Textarea label="Topic / idea" rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} error={error && name.trim() && !topic.trim() ? error : undefined} placeholder="Payoff-first openings, tested across 30 videos…" />
            </div>
            <div className="sm:col-span-2">
              <Textarea label="Description (optional)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this video about?" />
            </div>
            <div className="sm:col-span-2">
              <Input label="Content goal (optional)" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Reach 100k views in 90 days" />
            </div>
            <div className="sm:col-span-2">
              <LocalStorageNote />
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="outline" type="button" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create project</Button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
