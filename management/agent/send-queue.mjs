import { NEVER_CONTACT } from './config.mjs';
import { claimChecked } from './first-contact.mjs';
import { messageIdFor } from './mailer.mjs';

const CUT = 'Un envío anterior se cortó a medias y no se sabe si salió. Mira en Enviados de dmartin@naolito.com antes de devolverla a la cola.';

async function sendEmail(api, mailer, agency, report) {
  const item = await claimChecked(api, agency.id);
  if (!item) return report.attention.push(agency.id);
  const messageId = messageIdFor(agency.id);
  let info;
  try {
    info = await mailer.send({ to: item.recipient, subject: item.subject, text: item.body, messageId });
  } catch (error) {
    await api.recordStuck(agency.id, `El correo no salió: ${error.message}`.slice(0, 1000));
    return report.attention.push(agency.id);
  }
  // From here on the email is out: if this fails the agency stays in «Preparando» and the next run hands it to Nacho.
  await api.recordSent(agency.id, {
    subject: item.subject, body: item.body, via: 'email', recipient: item.recipient,
    proof: `Message-ID ${info.messageId}; SMTP: ${info.response}`,
  });
  return report.sent.push(agency.id);
}

async function stop(api, agency, why, report) {
  if (await claimChecked(api, agency.id)) await api.recordStuck(agency.id, why);
  report.attention.push(agency.id);
}

// Step 2: emails go out here. Forms are left in the queue for the browser step and listed in `forms`.
export async function sendQueue({ api, mailer, forms }) {
  const queue = await api.queue();
  const report = { sent: [], attention: [], forms: [], waiting: [], skipped: [] };
  const emails = queue.filter((a) => a.ready && a.state === 'cola' && a.via === 'email' && !NEVER_CONTACT.includes(a.id));
  if (emails.length) await mailer.verify();
  for (const agency of queue) {
    if (NEVER_CONTACT.includes(agency.id)) report.skipped.push(agency.id);
    else if (!agency.ready) report.waiting.push(agency.id);
    else if (agency.state === 'preparando') {
      await api.recordStuck(agency.id, CUT);
      report.attention.push(agency.id);
    } else if (agency.via === 'email') {
      if (agency.recipient) await sendEmail(api, mailer, agency, report);
      else await stop(api, agency, 'Su vía es email, pero no tiene dirección.', report);
    } else if (agency.via === 'form') {
      const form = forms[agency.id];
      if (!form) await stop(api, agency, 'No hay datos de su formulario en agent/forms.json.', report);
      else if (form.blocked) await stop(api, agency, form.blocked, report);
      else report.forms.push(agency.id);
    } else await stop(api, agency, 'No tiene una vía de contacto confirmada.', report);
  }
  return report;
}
