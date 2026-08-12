import type {ChatHistoryEntry} from "./protocol";

export const SENDER_ADDRESS = "chatbot@murugappan.dev";

export type Lead = {name?: string; contact: string; summary: string};

type EmailLike = {
  send(msg: {
    to: string;
    from: string;
    subject: string;
    text: string;
  }): Promise<unknown>;
};

export function parseLeadArguments(raw: string): Lead | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const lead = data as Record<string, unknown>;
  if (typeof lead.contact !== "string" || typeof lead.summary !== "string")
    return null;
  return {
    name: typeof lead.name === "string" ? lead.name : undefined,
    contact: lead.contact,
    summary: lead.summary
  };
}

export function formatOpportunityEmail(
  lead: Lead,
  transcript: ChatHistoryEntry[]
): {subject: string; text: string} {
  const who = lead.name || lead.contact;
  const lines = transcript.map(
    m => `${m.role === "user" ? "visitor" : "assistant"}: ${m.content}`
  );
  return {
    subject: `New opportunity via murugappan.dev chat — ${who}`,
    text: [
      `Name:    ${lead.name ?? "(not given)"}`,
      `Contact: ${lead.contact}`,
      `Summary: ${lead.summary}`,
      "",
      "--- Transcript ---",
      ...lines
    ].join("\n")
  };
}

export async function sendOpportunityEmail(
  email: EmailLike,
  inbox: string,
  lead: Lead,
  transcript: ChatHistoryEntry[]
): Promise<void> {
  const {subject, text} = formatOpportunityEmail(lead, transcript);
  await email.send({to: inbox, from: SENDER_ADDRESS, subject, text});
}
