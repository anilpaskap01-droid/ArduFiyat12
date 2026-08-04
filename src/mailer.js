import nodemailer from 'nodemailer';

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendVerificationEmail({ to, name, code }) {
  if (!smtpConfigured()) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV DOĞRULAMA KODU] ${to}: ${code}`);
      return { delivered: false, developmentCode: code };
    }
    throw new Error('E-posta servisi yapılandırılmamış.');
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `ArduFiyat <${process.env.SMTP_USER}>`,
    to,
    subject: 'ArduFiyat e-posta doğrulama kodun',
    text: `Merhaba ${name}, doğrulama kodun: ${code}. Kod 10 dakika geçerlidir.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px"><h2>ArduFiyat</h2><p>Merhaba ${escapeHtml(name)},</p><p>E-posta doğrulama kodun:</p><div style="font-size:32px;font-weight:800;letter-spacing:8px;padding:18px;background:#f4f4f5;border-radius:12px;text-align:center">${code}</div><p style="color:#666">Bu kod 10 dakika geçerlidir.</p></div>`
  });
  return { delivered: true };
}

function escapeHtml(value='') {
  return String(value).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
}
