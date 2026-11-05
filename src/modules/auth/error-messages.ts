// Better Auth error codes translated for the panel's forms.
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos.",
  INVALID_PASSWORD: "Senha incorreta.",
  INVALID_CODE: "Código incorreto. Confira o aplicativo e tente de novo.",
  INVALID_BACKUP_CODE: "Código de recuperação inválido ou já usado.",
  INVALID_TWO_FACTOR_COOKIE:
    "A verificação expirou. Entre novamente com e-mail e senha.",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
    "Muitas tentativas. Entre novamente com e-mail e senha.",
  ACCOUNT_TEMPORARILY_LOCKED:
    "Muitas tentativas incorretas. Aguarde 15 minutos e tente de novo.",
  TOTP_ALREADY_ENABLED: "A verificação em duas etapas já está ativa.",
};

// Codes after which the user has to start the sign-in again.
export const RESTART_SIGN_IN_CODES = new Set([
  "INVALID_TWO_FACTOR_COOKIE",
  "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE",
]);

export function authErrorMessage(error: { code?: string; status: number }) {
  if (error.status === 429) {
    return "Muitas tentativas. Aguarde um minuto e tente de novo.";
  }
  return (
    (error.code && MESSAGES[error.code]) ??
    "Não foi possível concluir. Tente novamente."
  );
}
