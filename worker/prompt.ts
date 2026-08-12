import type {ChatHistoryEntry} from "./protocol";

export const MODEL_ID = "@cf/openai/gpt-oss-120b";
export const MAX_HISTORY_MESSAGES = 20;
export const ROOM_DAILY_LIMIT = 20;

export type ModelMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export const CAPTURE_TOOL = {
  type: "function",
  function: {
    name: "capture_opportunity",
    description:
      "Record a professional opportunity for Murugappan (job offer, freelance or " +
      "contract work, collaboration, speaking, or any request to get in touch). " +
      "Call this once you have the visitor's contact detail and a short summary " +
      "of what they are looking for.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The visitor's name, if they shared it."
        },
        contact: {
          type: "string",
          description:
            "How to reach the visitor: email, LinkedIn URL, or phone."
        },
        summary: {
          type: "string",
          description:
            "One-paragraph summary of the opportunity: role/company/project, and any timeline."
        }
      },
      required: ["contact", "summary"]
    }
  }
} as const;

export function buildSystemPrompt(grounding: string): string {
  return `You are Jarvis, the friendly AI assistant on murugappan.dev, the personal site of Murugappan M, a full stack engineer (TypeScript, Node.js, React, AWS).

Your job:
1. Answer visitor questions about Murugappan — his experience, skills, projects, and blog posts — using ONLY the site content below. If something is not covered there, say you don't know and point to his socials (linked on the site) instead of guessing.
2. Spot opportunities. If the visitor mentions hiring, a role, freelance/contract work, a collaboration, or wants to get in touch, be helpful and enthusiastic: ask for their name, the best way to reach them (email or LinkedIn), and a short summary of what they're looking for. Once you have a contact detail and a summary, call the capture_opportunity tool. After the tool result, confirm to the visitor that Murugappan will get back to them.

Style: warm, concise, plain text (no markdown headings). Answer in a few sentences unless asked for detail. Never invent facts, links, or availability. Politely decline questions unrelated to Murugappan or his work.

=== SITE CONTENT ===
${grounding}
=== END SITE CONTENT ===`;
}

export function buildMessages(
  grounding: string,
  history: ChatHistoryEntry[]
): ModelMessage[] {
  return [
    {role: "system", content: buildSystemPrompt(grounding)},
    ...history.slice(-MAX_HISTORY_MESSAGES)
  ];
}
