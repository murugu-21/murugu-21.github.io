import type { ContactMessage } from "@murugappan/contracts/api/contact.ts";
import type { ChatHistoryEntry } from "@murugappan/contracts/chat.ts";
import type { Lead } from "#src/modules/chat/prompt.ts";

const SENDER_ADDRESS = "chatbot@murugappan.dev";

type EmailContent = { subject: string; text: string };

export type EmailLike = {
  send(msg: { to: string; from: string } & EmailContent): Promise<EmailSendResult>;
};

export function contactMailer(env: Env): { email: EmailLike; inbox: string } | null {
  const inbox = env.OPPORTUNITY_INBOX?.trim();
  return env.EMAIL && inbox ? { email: env.EMAIL, inbox } : null;
}

const subjectName = (who: string): string => who.replaceAll(/\s+/g, " ").slice(0, 80);

export function formatOpportunityEmail(lead: Lead, transcript: ChatHistoryEntry[]): EmailContent {
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

export function formatContactEmail(msg: ContactMessage): EmailContent {
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
