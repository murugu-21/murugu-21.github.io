import type { ContactMessage } from "#contracts/api/contact.ts";
import type { Lead } from "./prompt";
import type { ChatHistoryEntry } from "#contracts/chat.ts";

export const SENDER_ADDRESS = "chatbot@murugappan.dev";

export type EmailLike = {
  send(msg: { to: string; from: string; subject: string; text: string }): Promise<unknown>;
};

/** The configured relay and inbox, or null when either is missing. */
export function contactMailer(env: Env): { email: EmailLike; inbox: string } | null {
  // cloudflare.config.ts always sets both. The check stays so a misconfigured
  // env answers "not configured" instead of throwing.
  const inbox = env.OPPORTUNITY_INBOX?.trim();
  return env.EMAIL && inbox ? { email: env.EMAIL, inbox } : null;
}

const subjectName = (who: string): string => who.replace(/\s+/g, " ").slice(0, 80);

export function formatOpportunityEmail(
  lead: Lead,
  transcript: ChatHistoryEntry[]
): { subject: string; text: string } {
  const lines = transcript.map(m => `${m.role === "user" ? "visitor" : "assistant"}: ${m.content}`);
  return {
    subject: `New opportunity via murugappan.dev chat from ${subjectName(lead.name || lead.contact)}`,
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

export function formatContactEmail(msg: ContactMessage): {
  subject: string;
  text: string;
} {
  return {
    subject: `New message via the murugappan.dev API from ${subjectName(msg.name || msg.email)}`,
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
  msg: ContactMessage;
}): Promise<void> {
  const { subject, text } = formatContactEmail(msg);
  await email.send({ to: inbox, from: SENDER_ADDRESS, subject, text });
}
