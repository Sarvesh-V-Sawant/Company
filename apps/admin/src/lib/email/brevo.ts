interface SendEmailOptions {
  to: { email: string; name?: string };
  subject: string;
  htmlContent: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  // PHASE 15.19 DIAGNOSTIC — remove after runtime trace captured
  const payload = {
    sender: {
      email: process.env.BREVO_SENDER_EMAIL!,
      name: process.env.BREVO_SENDER_NAME!,
    },
    to: [options.to],
    subject: options.subject,
    htmlContent: options.htmlContent,
  };
  console.log(`[DIAG][BREVO] sendEmail() → to=${options.to.email}  subject="${options.subject}"`);
  console.log(`[DIAG][BREVO] sender email = ${process.env.BREVO_SENDER_EMAIL ?? '<not-set>'}`);
  console.log(`[DIAG][BREVO] sender name  = ${process.env.BREVO_SENDER_NAME ?? '<not-set>'}`);
  console.log(`[DIAG][BREVO] api-key present: ${!!process.env.BREVO_API_KEY}  prefix: ${process.env.BREVO_API_KEY?.slice(0, 12) ?? '<not-set>'}...`);
  console.log(`[DIAG][BREVO] htmlContent length: ${options.htmlContent.length} chars`);
  console.log('[DIAG][BREVO] Calling https://api.brevo.com/v3/smtp/email');

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
    console.error(`[DIAG][BREVO] fetch() threw (network error): ${fetchErr}`);
    throw fetchErr;
  }

  console.log(`[DIAG][BREVO] Brevo HTTP status: ${res.status}`);

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[DIAG][BREVO] Brevo error ${res.status}: ${errBody}`);
    throw new Error(`Brevo error ${res.status}: ${errBody}`);
  }

  const body = await res.json() as { messageId?: string; [key: string]: unknown };
  console.log(`[DIAG][BREVO] Brevo accepted. messageId=${body.messageId ?? '<none>'}  response=${JSON.stringify(body)}`);
}
