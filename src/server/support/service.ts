import { getDb } from "@/src/server/db";
import { backendUnavailable, notFound, validationError } from "@/src/server/errors";
import type { SessionUser } from "@/src/server/auth";
import { accountSnapshot } from "@/src/server/support/snapshot";
import { assistantTurn, type ChatLine } from "@/src/server/support/assistant";
import { alertTeam, sendAnswerCopy, sendHandoffConfirmation } from "@/src/server/support/emails";

/** Support conversations. Every read and write is scoped to the owner. */

export interface SupportMessage {
  id: string;
  role: ChatLine["role"];
  body: string;
  createdAt: string;
}

export interface SupportConversation {
  id: string;
  status: "open" | "handoff" | "resolved";
  subject: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  userUnread: boolean;
  messages: SupportMessage[];
}

export const MAX_MESSAGE = 1500;
export const MAX_TURNS = 60;

function db() {
  const d = getDb();
  if (!d) throw backendUnavailable("Database");
  return d;
}

const toMessage = (r: Record<string, unknown>): SupportMessage => ({
  id: String(r.id),
  role: String(r.role) as ChatLine["role"],
  body: String(r.body),
  createdAt: new Date(String(r.created_at)).toISOString(),
});

export async function listConversations(userId: string) {
  const rows = await db()`
    SELECT id, status, subject, category, created_at, updated_at, user_unread FROM support_conversations
    WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 20`;
  return rows.map((r) => ({
    id: String(r.id),
    status: String(r.status),
    subject: String(r.subject),
    category: String(r.category),
    createdAt: new Date(String(r.created_at)).toISOString(),
    updatedAt: new Date(String(r.updated_at)).toISOString(),
    userUnread: Boolean(r.user_unread),
  }));
}

/** Load one conversation, only if it belongs to this user (404 otherwise — never reveal others exist). */
export async function getConversation(userId: string, id: string, markRead = true): Promise<SupportConversation> {
  const d = db();
  const [c] = await d`SELECT * FROM support_conversations WHERE id = ${id} AND user_id = ${userId}`;
  if (!c) throw notFound("Conversation");
  const msgs = await d`SELECT id, role, body, created_at FROM support_messages WHERE conversation_id = ${id} ORDER BY created_at ASC LIMIT 200`;
  if (markRead && c.user_unread) await d`UPDATE support_conversations SET user_unread = false WHERE id = ${id}`;
  return {
    id: String(c.id),
    status: String(c.status) as SupportConversation["status"],
    subject: String(c.subject),
    category: String(c.category),
    createdAt: new Date(String(c.created_at)).toISOString(),
    updatedAt: new Date(String(c.updated_at)).toISOString(),
    userUnread: false,
    messages: msgs.map(toMessage),
  };
}

async function handOff(user: SessionUser, conversationId: string, subject: string, summary: string): Promise<void> {
  const d = db();
  const [c] = await d`SELECT status FROM support_conversations WHERE id = ${conversationId}`;
  const already = c?.status === "handoff";
  await d`
    UPDATE support_conversations
    SET status = 'handoff', admin_unread = true, handoff_summary = ${summary.slice(0, 2000)}, updated_at = now()
    WHERE id = ${conversationId}`;
  if (already) return;
  // Best effort: the chat is already saved for the team even if an email fails.
  await Promise.allSettled([
    user.emailVerifiedAt ? sendHandoffConfirmation(user.email, user.name, subject) : Promise.resolve(null),
    alertTeam(conversationId, user.email, subject, summary),
  ]);
}

/** One chat turn: store the user's message, answer from their own account, maybe hand over. */
export async function chat(user: SessionUser, workspaceId: string | null, conversationId: string | null, message: string): Promise<SupportConversation> {
  const text = message.replace(/\r/g, "").trim();
  if (!text) throw validationError("Write a message first.");
  if (text.length > MAX_MESSAGE) throw validationError(`Keep messages under ${MAX_MESSAGE} characters.`);
  const d = db();

  let id = conversationId;
  if (id) {
    const [c] = await d`SELECT id FROM support_conversations WHERE id = ${id} AND user_id = ${user.id}`;
    if (!c) throw notFound("Conversation");
    const [n] = await d`SELECT count(*) AS n FROM support_messages WHERE conversation_id = ${id}`;
    if (Number(n?.n ?? 0) >= MAX_TURNS) throw validationError("This conversation is full. Start a new one from the support panel.");
  } else {
    const [c] = await d`INSERT INTO support_conversations (user_id, workspace_id, subject) VALUES (${user.id}, ${workspaceId}, ${text.slice(0, 80)}) RETURNING id`;
    id = String(c.id);
  }
  await d`INSERT INTO support_messages (conversation_id, role, body) VALUES (${id}, 'user', ${text})`;

  const [conv] = await d`SELECT status FROM support_conversations WHERE id = ${id}`;
  // Once a teammate owns the chat, the assistant steps back — new messages go straight to the team.
  if (conv?.status === "handoff") {
    await d`UPDATE support_conversations SET admin_unread = true, updated_at = now() WHERE id = ${id}`;
    return getConversation(user.id, id);
  }

  const history = (await d`SELECT role, body FROM support_messages WHERE conversation_id = ${id} ORDER BY created_at ASC LIMIT 60`).map(
    (r) => ({ role: String(r.role) as ChatLine["role"], body: String(r.body) }),
  );
  const snapshot = await accountSnapshot(user.id, workspaceId);
  const turn = await assistantTurn(snapshot, history);

  await d`INSERT INTO support_messages (conversation_id, role, body, meta) VALUES (${id}, 'assistant', ${turn.reply}, ${JSON.stringify({ action: turn.action, category: turn.category })})`;
  await d`
    UPDATE support_conversations
    SET subject = CASE WHEN category = '' THEN ${turn.subject} ELSE subject END,
        category = ${turn.category},
        status = ${turn.action === "resolved" ? "resolved" : "open"},
        updated_at = now()
    WHERE id = ${id}`;
  if (turn.action === "handoff") await handOff(user, id, turn.subject, turn.handoffSummary);
  else if (turn.email && user.emailVerifiedAt) await emailAnswer(user, id, turn.subject, text, turn.reply);
  return getConversation(user.id, id);
}

/** The assistant chose to email this answer: at most 3 a day per user, never twice in a row. */
async function emailAnswer(user: SessionUser, conversationId: string, subject: string, question: string, answer: string): Promise<void> {
  const d = db();
  try {
    const [recent] = await d`
      SELECT count(*) AS n FROM support_messages m JOIN support_conversations c ON c.id = m.conversation_id
      WHERE c.user_id = ${user.id} AND m.role = 'system' AND m.meta->>'emailed' = 'true' AND m.created_at > now() - interval '1 day'`;
    if (Number(recent?.n ?? 0) >= 3) return;
    const res = await sendAnswerCopy(user.email, user.name, subject, question, answer);
    if (res.sent) {
      await d`INSERT INTO support_messages (conversation_id, role, body, meta) VALUES (${conversationId}, 'system', ${`A copy was emailed to ${user.email}.`}, ${JSON.stringify({ emailed: true })})`;
    }
  } catch (error) {
    console.error("support answer email failed:", error instanceof Error ? error.message : String(error));
  }
}

/** The user asks for a person directly. */
export async function requestHuman(user: SessionUser, id: string, note: string): Promise<SupportConversation> {
  const conv = await getConversation(user.id, id, false);
  const d = db();
  const clean = note.trim().slice(0, MAX_MESSAGE);
  if (clean) await d`INSERT INTO support_messages (conversation_id, role, body) VALUES (${id}, 'user', ${clean})`;
  await d`INSERT INTO support_messages (conversation_id, role, body) VALUES (${id}, 'system', 'You asked for a teammate. We will reply here and by email.')`;
  await handOff(user, id, conv.subject || "Support request", clean || "The user asked to talk to a person.");
  return getConversation(user.id, id);
}

export async function resolveConversation(userId: string, id: string): Promise<SupportConversation> {
  await getConversation(userId, id, false);
  await db()`UPDATE support_conversations SET status = 'resolved', updated_at = now() WHERE id = ${id} AND user_id = ${userId}`;
  return getConversation(userId, id);
}
