// A strong random password for root to hand over. No look-alike characters
// (0/O, 1/l/I), so it can be read out loud or typed from a phone.
const ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?";

export const GENERATED_PASSWORD_LENGTH = 20;

export function generatePassword(length = GENERATED_PASSWORD_LENGTH): string {
  // Rejection sampling: bytes past the last full multiple of the alphabet are
  // dropped, so every character is equally likely.
  const limit = 256 - (256 % ALPHABET.length);
  let out = "";
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && out.length < length) {
        out += ALPHABET[byte % ALPHABET.length];
      }
    }
  }
  return out;
}
