import type { ContactRequest } from "./api/contact";
import type { ChatHistoryEntry } from "./protocol";

export const SENDER_ADDRESS = "chatbot@murugappan.dev";

export type Lead = { name?: string; contact: string; summary: string };

export type EmailLike = {
  send(msg: { to: string; from: string; subject: string; text: string }): Promise<unknown>;
};

/** The configured relay and inbox, or null when the deploy lacks either. */
export function contactMailer(env: Env): { email: EmailLike; inbox: string } | null {
  // Typed non-optional, but a deploy can lack the binding or the var.
  const inbox = env.OPPORTUNITY_INBOX?.trim();
  return env.EMAIL && inbox ? { email: env.EMAIL, inbox } : null;
}

export function parseLeadArguments(raw: string): Lead | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const lead = data as Record<string, unknown>;
  if (typeof lead.contact !== "string" || typeof lead.summary !== "string") return null;
  return {
    name: typeof lead.name === "string" ? lead.name : undefined,
    contact: lead.contact,
    summary: lead.summary
  };
}

const subjectName = (who: string): string => who.replace(/\s+/g, " ").slice(0, 80);

export function formatOpportunityEmail(
  lead: Lead,
  transcript: ChatHistoryEntry[]
): { subject: string; text: string } {
  const lines = transcript.map(m => `${m.role === "user" ? "visitor" : "assistant"}: ${m.content}`);
  return {
    subject: `New opportunity via murugappan.dev chat — ${subjectName(lead.name || lead.contact)}`,
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

export async function sendOpportunityEmail({
  email,
  inbox,
  lead,
  transcript
}: {
  email: EmailLike;
  inbox: string;
  lead: Lead;
  transcript: ChatHistoryEntry[];
}): Promise<void> {
  const { subject, text } = formatOpportunityEmail(lead, transcript);
  await email.send({ to: inbox, from: SENDER_ADDRESS, subject, text });
}

export function formatContactEmail(msg: ContactRequest): {
  subject: string;
  text: string;
} {
  return {
    subject: `New message via the murugappan.dev API — ${subjectName(msg.name || msg.email)}`,
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

export async function sendContactEmail({
  email,
  inbox,
  msg
}: {
  email: EmailLike;
  inbox: string;
  msg: ContactRequest;
}): Promise<void> {
  const { subject, text } = formatContactEmail(msg);
  await email.send({ to: inbox, from: SENDER_ADDRESS, subject, text });
}
