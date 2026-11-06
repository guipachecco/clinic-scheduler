// EMAIL_FROM is written the usual way, "Zemana <nao-responda@zemana.com.br>",
// or as a bare address. MailerSend wants the name and the address apart.
// No imports: src/lib/env.ts validates EMAIL_FROM with this.

export type Sender = { email: string; name?: string };

const ADDRESS = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const NAMED = /^(.*?)\s*<([^<>]*)>$/;

// null when the text is not a sender.
export function parseSender(from: string): Sender | null {
  const text = from.trim();
  const named = NAMED.exec(text);
  if (named) {
    const email = named[2]!.trim();
    if (!ADDRESS.test(email)) return null;
    const name = named[1]!
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .trim();
    if (/[<>]/.test(name)) return null;
    return name ? { email, name } : { email };
  }
  return ADDRESS.test(text) ? { email: text } : null;
}
