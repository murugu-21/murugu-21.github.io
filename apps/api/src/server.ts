import { createApp } from "#src/app.ts";
import { ChatRoom } from "#src/modules/chat/chat-room.durable-object.ts";
import { RateLimiter } from "#src/modules/rate-limit/rate-limiter.durable-object.ts";

export { ChatRoom, RateLimiter };

export default createApp();
