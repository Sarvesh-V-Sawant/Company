const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

interface SendEmailOptions {
  to: { email: string; name?: string };
  subject: string;
  htmlContent: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const payload = {
    sender: {
      email: process.env.BREVO_SENDER_EMAIL!,
      name: process.env.BREVO_SENDER_NAME!,
    },
    to: [options.to],
    subject: options.subject,
    htmlContent: options.htmlContent,
  };

  let res: Response;
  try {
    res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (fetchErr) {
    throw fetchErr;
  }

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Brevo error ${res.status}: ${errBody}`);
  }

  await res.json();
}

// ──────────────────────────────────────────────────────────────────
// Phase 30.04 addition.
// sendEmail() above is UNCHANGED so password-reset, welcome, leave and payroll
// mail cannot regress. The Work Desk needs multiple recipients, cc/bcc and file
// attachments, which the original single-recipient signature cannot express, so
// this is a separate additive function.
// ──────────────────────────────────────────────────────────────────

export interface TransactionalAttachment {
  /** File name shown to the recipient. */
  name: string;
  /** Base64-encoded file content. */
  content: string;
}

export interface TransactionalEmailOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  attachments?: TransactionalAttachment[];
  replyTo?: string;
}

export interface TransactionalEmailResult {
  messageId?: string;
}

export class EmailProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'EmailProviderError';
  }
}

/**
 * Sends a multi-recipient email with optional attachments via Brevo.
 * Throws EmailProviderError so callers can tell a provider rejection apart from
 * a programming fault and record the reason on the EmailLog.
 */
export async function sendTransactionalEmail(
  options: TransactionalEmailOptions,
): Promise<TransactionalEmailResult> {
  if (!process.env.BREVO_API_KEY) {
    throw new EmailProviderError('Email provider is not configured.');
  }
  if (options.to.length === 0) {
    throw new EmailProviderError('At least one recipient is required.');
  }

  const payload: Record<string, unknown> = {
    sender: {
      email: process.env.BREVO_SENDER_EMAIL!,
      name: process.env.BREVO_SENDER_NAME!,
    },
    to: options.to.map((email) => ({ email })),
    subject: options.subject,
    htmlContent: options.htmlContent,
  };
  if (options.cc?.length) payload.cc = options.cc.map((email) => ({ email }));
  if (options.bcc?.length) payload.bcc = options.bcc.map((email) => ({ email }));
  if (options.textContent) payload.textContent = options.textContent;
  if (options.replyTo) payload.replyTo = { email: options.replyTo };
  if (options.attachments?.length) {
    payload.attachment = options.attachments.map((a) => ({
      name: a.name,
      content: a.content,
    }));
  }

  let res: Response;
  try {
    res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (fetchErr) {
    throw new EmailProviderError(
      fetchErr instanceof Error
        ? fetchErr.message
        : 'Network error contacting the email provider.',
    );
  }

  if (!res.ok) {
    // Deliberately does not echo the response body, which can contain the
    // recipient list and provider account metadata.
    throw new EmailProviderError('Email provider rejected the message.', res.status);
  }

  const json = (await res.json().catch(() => ({}))) as { messageId?: string };
  return { messageId: json.messageId };
}
