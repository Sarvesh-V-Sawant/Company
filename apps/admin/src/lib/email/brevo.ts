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
