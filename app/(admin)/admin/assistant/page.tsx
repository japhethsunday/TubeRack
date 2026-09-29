"use client";

import { PageTitle } from "@/src/components/admin/kit";
import { AssistantChat } from "@/src/components/admin/AssistantChat";
import { useAssistantTurns } from "@/src/components/admin/AssistantLauncher";

export default function AdminAssistant() {
  const [turns, setTurns] = useAssistantTurns();
  return (
    <>
      <PageTitle title="Assistant" sub="Ask about the business, look into accounts, and get things done. Changes only happen when you tap Confirm." />
      <AssistantChat turns={turns} setTurns={setTurns} />
    </>
  );
}
