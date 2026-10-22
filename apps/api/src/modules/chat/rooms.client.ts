import { CONVERSATION_RETENTION_MS } from "#src/modules/chat/visitor.ts";

export async function deleteExpiredConversations(env: Env, now: number): Promise<void> {
  const cutoff = now - CONVERSATION_RETENTION_MS;
  const db = env.CHAT_DB;
  const [, rooms] = await db.batch([
    db
      .prepare(
        `DELETE FROM messages WHERE room_id IN (SELECT room_id FROM rooms WHERE last_seen <= ?)`
      )
      .bind(cutoff),
    db.prepare(`DELETE FROM rooms WHERE last_seen <= ?`).bind(cutoff)
  ]);
  console.log({ event: "expired conversations deleted", rooms: rooms?.meta.changes });
}
