// The two e-mails the app sends: confirming the address after signup and
// changing a forgotten password. Plain HTML with inline styles, which is what
// e-mail clients render; every value placed in it is escaped.

type EmailContent = { subject: string; html: string; text: string };

type TemplateInput = {
  // Absolute site address (BETTER_AUTH_URL), for the logo.
  baseUrl: string;
  // The page the button opens, already absolute.
  url: string;
  userName: string;
  // Unknown when the link is not tied to a clinic page.
  clinicName: string | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout(input: {
  baseUrl: string;
  title: string;
  paragraphs: string[];
  button: string;
  url: string;
  footer: string;
}) {
  const logo = `${input.baseUrl.replace(/\/$/, "")}/marca/zemana-horizontal.png`;
  const paragraphs = input.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#1f2933">${escapeHtml(p)}</p>`,
    )
    .join("");
  return `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px">
<tr><td style="padding:24px 24px 8px"><img src="${escapeHtml(logo)}" alt="Zemana" width="160" style="display:block;height:auto;border:0"></td></tr>
<tr><td style="padding:8px 24px 24px">
<h1 style="margin:0 0 16px;font-size:20px;color:#1f2933">${escapeHtml(input.title)}</h1>
${paragraphs}
<p style="margin:24px 0"><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:12px 20px;background:#1f2933;color:#ffffff;border-radius:8px;text-decoration:none;font-size:16px">${escapeHtml(input.button)}</a></p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#52606d">Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all">${escapeHtml(input.url)}</span></p>
<p style="margin:0;font-size:14px;line-height:1.5;color:#52606d">${escapeHtml(input.footer)}</p>
</td></tr>
</table>
</body>
</html>`;
}

function greeting(userName: string) {
  // The full name as typed at signup, spaces tidied.
  const name = userName.trim().replace(/\s+/g, " ");
  return name ? `Olá, ${name}!` : "Olá!";
}

export function verificationEmail(input: TemplateInput): EmailContent {
  const where = input.clinicName ? ` em ${input.clinicName}` : "";
  const subject = input.clinicName
    ? `Confirme seu e-mail - ${input.clinicName}`
    : "Confirme seu e-mail";
  const paragraphs = [
    greeting(input.userName),
    `Falta só confirmar seu e-mail para marcar horários${where}.`,
  ];
  const footer =
    "O link vale por 1 hora. Se você não criou esta conta, ignore este e-mail.";
  return {
    subject,
    html: layout({
      baseUrl: input.baseUrl,
      title: "Confirme seu e-mail",
      paragraphs,
      button: "Confirmar e-mail",
      url: input.url,
      footer,
    }),
    text: [...paragraphs, `Confirme pelo link: ${input.url}`, footer].join(
      "\n\n",
    ),
  };
}

export function resetPasswordEmail(input: TemplateInput): EmailContent {
  const where = input.clinicName ? ` para marcar em ${input.clinicName}` : "";
  // Without a clinic the request came from the Zemana pages.
  const subject = input.clinicName
    ? `Troque sua senha - ${input.clinicName}`
    : "Troque sua senha da Zemana";
  const paragraphs = [
    greeting(input.userName),
    `Recebemos um pedido para trocar a senha da sua conta${where}.`,
  ];
  const footer =
    "O link vale por 1 hora. Se você não pediu a troca, ignore este e-mail: sua senha continua a mesma.";
  return {
    subject,
    html: layout({
      baseUrl: input.baseUrl,
      title: "Troque sua senha",
      paragraphs,
      button: "Criar nova senha",
      url: input.url,
      footer,
    }),
    text: [
      ...paragraphs,
      `Crie a nova senha pelo link: ${input.url}`,
      footer,
    ].join("\n\n"),
  };
}
