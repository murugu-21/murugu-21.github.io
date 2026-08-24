import type {ChatHistoryEntry} from "./protocol";

export const SENDER_ADDRESS = "chatbot@murugappan.dev";

export type Lead = {name?: string; contact: string; summary: string};

export type EmailLike = {
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
  const who = (lead.name || lead.contact).replace(/\s+/g, " ").slice(0, 80);
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

// POST /api/contact's payload. Separate from Lead (the chat's
// capture_opportunity tool result) because there is no transcript to attach
// and the sender chose their own wording — the email says which door the
// message came through so replies can be triaged.
export type ContactMessage = {
  name?: string;
  email: string;
  company?: string;
  message: string;
};

export function formatContactEmail(msg: ContactMessage): {
  subject: string;
  text: string;
} {
  const who = (msg.name || msg.email).replace(/\s+/g, " ").slice(0, 80);
  return {
    subject: `New message via the murugappan.dev API — ${who}`,
    text: [
      `Name:    ${msg.name ?? "(not given)"}`,
      `Email:   ${msg.email}`,
      `Company: ${msg.company ?? "(not given)"}`,
      "Source:  POST /api/contact",
      "",
      "--- Message ---",
      msg.message
    ].join("\n")
  };
}

export async function sendContactEmail(
  email: EmailLike,
  inbox: string,
  msg: ContactMessage
): Promise<void> {
  const {subject, text} = formatContactEmail(msg);
  await email.send({to: inbox, from: SENDER_ADDRESS, subject, text});
}
