import { createApp } from "#src/app.ts";
import { ChatRoom } from "#src/modules/chat/chat-room.durable-object.ts";
import { deleteExpiredConversations } from "#src/modules/chat/rooms.client.ts";
import { RateLimiter } from "#src/modules/rate-limit/rate-limiter.durable-object.ts";

export { ChatRoom, RateLimiter };

const app = createApp();

export default {
  fetch: app.fetch,
  scheduled: (controller, env) => deleteExpiredConversations(env, controller.scheduledTime)
} satisfies ExportedHandler<Env>;
