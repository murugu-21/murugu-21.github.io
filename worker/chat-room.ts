import {Server} from "partyserver";

// Fleshed out in a later task; class must exist for wrangler config validity.
export class ChatRoom extends Server {
  static options = {hibernate: true};
}
