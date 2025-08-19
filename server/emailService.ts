import { MailService } from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  throw new Error("SENDGRID_API_KEY environment variable must be set");
}

const mailService = new MailService();
mailService.setApiKey(process.env.SENDGRID_API_KEY);

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    await mailService.send({
      to: params.to,
      from: params.from,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    console.log(`Email sent successfully to ${params.to}`);
    return true;
  } catch (error) {
    console.error('SendGrid email error:', error);
    return false;
  }
}

// TICKET 2: Household invite email template
export async function sendHouseholdInviteEmail(
  inviteEmail: string,
  inviterName: string,
  householdName: string,
  inviteToken: string,
  role: string
): Promise<boolean> {
  const acceptUrl = `${process.env.APP_ORIGIN ?? 'https://myhome-docs.com'}/invite/accept?token=${inviteToken}`;
  
  const roleDisplayName = role === 'duo_partner' ? 'Duo Partner' : 'Household User';
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>MyHome Household Invite</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1E90FF; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #FAF4EF; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #1E90FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { margin-top: 30px; font-size: 14px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🏠 MyHome Household Invite</h1>
        </div>
        <div class="content">
          <h2>You've been invited to join a household!</h2>
          
          <p><strong>${inviterName}</strong> has invited you to join the <strong>${householdName}</strong> household as a <strong>${roleDisplayName}</strong>.</p>
          
          <p>MyHome helps families organize and manage their property documents together. By joining this household, you'll be able to:</p>
          
          <ul>
            <li>📄 Access shared household documents</li>
            <li>🔍 View AI insights for all household files</li>
            <li>📧 Use shared email forwarding for document ingestion</li>
            <li>🏠 Collaborate on home management tasks</li>
          </ul>
          
          <p><strong>Click the button below to accept your invite:</strong></p>
          <a href="${acceptUrl}" class="button">Accept Household Invite</a>
          
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 4px;">${acceptUrl}</p>
          
          <div class="footer">
            <p>This invite expires in 7 days. If you didn't expect this invite, you can safely ignore this email.</p>
            <p>Need help? Contact us at support@myhome-docs.com</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
MyHome Household Invite

${inviterName} has invited you to join the ${householdName} household as a ${roleDisplayName}.

MyHome helps families organize and manage their property documents together. By joining this household, you'll be able to:

• Access shared household documents
• View AI insights for all household files  
• Use shared email forwarding for document ingestion
• Collaborate on home management tasks

To accept your invite, visit: ${acceptUrl}

This invite expires in 7 days. If you didn't expect this invite, you can safely ignore this email.

Need help? Contact us at support@myhome-docs.com
  `;

  return await sendEmail({
    to: inviteEmail,
    from: 'MyHome <noreply@myhome-docs.com>',
    subject: `You've been invited to join ${householdName} on MyHome`,
    html: htmlContent,
    text: textContent,
  });
}