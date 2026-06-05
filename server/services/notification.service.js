const nodemailer = require('nodemailer');

let mailTransporter = null;

function getMailTransporter() {
  if (mailTransporter) return mailTransporter;
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  if (!host || !user || !pass) return null;
  mailTransporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: { user, pass },
  });
  return mailTransporter;
}

async function sendMailMessage({ to, subject, text, html, logPrefix = 'mail' }) {
  const transporter = getMailTransporter();
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'noreply@quantum.local';
  if (!transporter) {
    console.log('[' + logPrefix + '] ' + to + ': ' + text);
    return { sent: false };
  }
  await transporter.sendMail({ from, to, subject, text, html });
  return { sent: true };
}

module.exports = { getMailTransporter, sendMailMessage };
