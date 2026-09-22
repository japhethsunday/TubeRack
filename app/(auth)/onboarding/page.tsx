"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { AuthLayout } from "@/src/components/auth/AuthLayout";
import { AuthBoundaryNotice } from "@/src/components/auth/AuthBoundaryNotice";
import { Input, Textarea, Select } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Progress } from "@/src/components/ui/feedback";
import { cx } from "@/src/components/ui/cx";

const STEPS = ["Profile", "Goals", "Channel", "Brand"] as const;

const GOALS = [
  "YouTube long-form",
  "Shorts",
  "TikTok",
  "Reels",
  "Educational",
  "Documentary",
  "Faceless content",
  "Personal brand",
  "Business content",
];

/** Creator onboarding: short, skippable, validated where it matters. Nothing stored yet. */
export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [identity, setIdentity] = useState("Creator");
  const [goals, setGoals] = useState<string[]>([]);
  const [channel, setChannel] = useState("");
  const [niche, setNiche] = useState("");
  const [tone, setTone] = useState("Helpful and direct");
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);

  function next() {
    if (step === 0 && name.trim().length === 0) {
      setError("Enter your name to continue — or skip.");
      return;
    }
    setError(undefined);
    if (step === STEPS.length - 1) setDone(true);
    else setStep((s) => s + 1);
  }

  function toggleGoal(g: string) {
    setGoals((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  return (
    <AuthLayout
      title={done ? "You are set" : `Onboarding — ${STEPS[step]}`}
      subtitle={
        done
          ? "Defaults previewed below."
          : `Step ${step + 1} of ${STEPS.length}. Skip anything non-essential.`
      }
      footer={
        !done && (
          <button type="button" onClick={() => setStep(STEPS.length - 1)} className="underline">
            Skip to the end
          </button>
        )
      }
    >
      {done ? (
        <div className="space-y-4">
          <AuthBoundaryNotice
            feature="Onboarding"
            validated={`Profile for ${name || "unnamed creator"} (${identity}), ${goals.length} goal(s), channel “${channel || "—"}” checked locally.`}
            returnTo="/dashboard"
          />
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go to dashboard
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          <Progress value={((step + 1) / STEPS.length) * 100} label={`Step ${step + 1}: ${STEPS[step]}`} />

          {step === 0 && (
            <div className="space-y-4">
              <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} error={error} placeholder="Ada Lovelace" />
              <Select label="Creator identity" value={identity} onChange={(e) => setIdentity(e.target.value)}>
                <option>Creator</option>
                <option>Educator</option>
                <option>Brand / business</option>
                <option>Agency / team</option>
              </Select>
            </div>
          )}

          {step === 1 && (
            <fieldset>
              <legend className="text-xs font-medium">What will you make? (pick any)</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {GOALS.map((g) => {
                  const on = goals.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleGoal(g)}
                      className={cx(
                        "rounded-full border px-3 py-1.5 text-sm transition-colors duration-150",
                        on
                          ? "border-primary bg-primary font-medium text-primary-foreground"
                          : "border-border bg-surface hover:bg-muted",
                      )}
                    >
                      {on && <Check className="mr-1 inline size-3.5" aria-hidden="true" />}
                      {g}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Input label="Channel name" value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="Studio Ada" />
              <Input label="Niche" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Creator education" />
              <Textarea label="Audience (optional)" rows={2} placeholder="Who is this for?" />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <Select label="Content tone" value={tone} onChange={(e) => setTone(e.target.value)}>
                <option>Helpful and direct</option>
                <option>Playful and fast</option>
                <option>Calm and cinematic</option>
                <option>Bold and contrarian</option>
              </Select>
              <p className="text-xs text-muted-text">
                Tone, voice, and visual defaults become Brand DNA in Phase 4 — this step only previews the questions.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back
            </Button>
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="outline" size="sm" onClick={next}>
                  Skip step
                </Button>
              )}
              <Button size="sm" onClick={next}>
                {step === STEPS.length - 1 ? "Finish" : "Continue"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
