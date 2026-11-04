// Notification par email via l'API Resend (https://resend.com).
// Optionnel : sans RESEND_API_KEY, rien n'est envoyé, mais les demandes restent enregistrées
// en base et visibles dans l'administration.

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

async function sendMail({ to, subject, html, text, replyTo }) {
  if (!mailConfigured() || !to) return { sent: false, reason: "non configuré" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || "SIPOKTECH DIGITAL <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {})
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      console.error(`Envoi email refusé (HTTP ${response.status}).`);
      return { sent: false, reason: `HTTP ${response.status}` };
    }
    return { sent: true };
  } catch (error) {
    console.error("Envoi email impossible :", error.message);
    return { sent: false, reason: error.message };
  }
}

function row(label, value) {
  return `<tr><td style="padding:6px 12px 6px 0;color:#5b6b7f;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 0;color:#071426">${escapeHtml(value)}</td></tr>`;
}

function notifyQuote(reference, q, adminUrl) {
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px">
    <h2 style="color:#071426;margin:0 0 4px">Nouvelle demande de devis ${escapeHtml(reference)}</h2>
    <p style="color:#5b6b7f;margin:0 0 16px">Reçue depuis le site SIPOKTECH DIGITAL.</p>
    <table style="border-collapse:collapse;font-size:14px">
      ${row("Prestation", q.service_title)}${row("Nom", q.name)}${row("Email", q.email)}
      ${row("Téléphone / WhatsApp", q.phone || "—")}${row("Entreprise", q.company || "—")}
      ${row("Budget", q.budget)}${row("Délai souhaité", q.deadline)}
    </table>
    <h3 style="color:#071426;margin:20px 0 6px">Besoin décrit</h3>
    <p style="white-space:pre-wrap;color:#071426;margin:0">${escapeHtml(q.description)}</p>
    ${adminUrl ? `<p style="margin-top:20px"><a href="${escapeHtml(adminUrl)}" style="color:#0a8fb3">Ouvrir l'administration</a></p>` : ""}
  </div>`;
  const text = `Nouvelle demande de devis ${reference}\n\nPrestation : ${q.service_title}\nNom : ${q.name}\nEmail : ${q.email}\nTéléphone : ${q.phone || "—"}\nEntreprise : ${q.company || "—"}\nBudget : ${q.budget}\nDélai : ${q.deadline}\n\n${q.description}\n`;
  return sendMail({
    to: process.env.CONTACT_EMAIL,
    subject: `Nouveau devis ${reference} — ${q.service_title}`,
    html,
    text,
    replyTo: q.email
  });
}

function notifyMessage(m, adminUrl) {
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px">
    <h2 style="color:#071426;margin:0 0 4px">Nouveau message</h2>
    <table style="border-collapse:collapse;font-size:14px">${row("Nom", m.name)}${row("Email", m.email)}${row("Sujet", m.subject)}</table>
    <p style="white-space:pre-wrap;color:#071426;margin-top:16px">${escapeHtml(m.message)}</p>
    ${adminUrl ? `<p style="margin-top:20px"><a href="${escapeHtml(adminUrl)}" style="color:#0a8fb3">Ouvrir l'administration</a></p>` : ""}
  </div>`;
  const text = `Nouveau message\n\nNom : ${m.name}\nEmail : ${m.email}\nSujet : ${m.subject}\n\n${m.message}\n`;
  return sendMail({
    to: process.env.CONTACT_EMAIL,
    subject: `Nouveau message — ${m.subject}`,
    html,
    text,
    replyTo: m.email
  });
}

module.exports = { sendMail, mailConfigured, notifyQuote, notifyMessage, escapeHtml };
