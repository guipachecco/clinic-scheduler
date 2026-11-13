// Manages the panel accounts from the terminal. Run `pnpm admin` for help.
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

import { endPools } from "../src/db/client";
import {
  AdminAccountError,
  createAdmin,
  resetAdminPassword,
  resetAdminTwoFactor,
} from "../src/modules/auth/admin-accounts";

const USAGE = `Uso:
  pnpm admin create                  cria a conta da dona de uma clínica
  pnpm admin create-root             cria uma conta root, que vê todas as clínicas
  pnpm admin reset-password <email>  define uma nova senha e encerra as sessões
  pnpm admin reset-2fa <email>       remove o 2FA do root; o próximo login pede nova configuração`;

async function ask(question: string) {
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    return (await readline.question(question)).trim();
  } finally {
    readline.close();
  }
}

// Reads a line without echoing it, so the password does not appear on screen.
function askHidden(question: string): Promise<string> {
  if (!stdin.isTTY) {
    return Promise.reject(
      new AdminAccountError(
        "Rode o comando num terminal para digitar a senha.",
      ),
    );
  }
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n" || char === "\u0004") {
          finish();
          return;
        }
        if (char === "\u0003") {
          finish(new AdminAccountError("Cancelado."));
          return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function askNewPassword() {
  const password = await askHidden("Senha (mínimo 12 caracteres): ");
  const confirmation = await askHidden("Repita a senha: ");
  if (password !== confirmation) {
    throw new AdminAccountError("As senhas não conferem.");
  }
  return password;
}

function requireEmailArgument(email: string | undefined) {
  if (!email) throw new AdminAccountError(`Informe o e-mail.\n\n${USAGE}`);
  return email;
}

async function main() {
  const [command, emailArgument] = process.argv.slice(2);

  switch (command) {
    case "create":
    case "create-root": {
      const role = command === "create-root" ? "root" : "admin";
      const clinicSlug =
        role === "admin"
          ? await ask("Endereço da clínica (por exemplo, grais): ")
          : undefined;
      const email = await ask("E-mail: ");
      const name = await ask("Nome: ");
      const password = await askNewPassword();
      await createAdmin({ role, clinicSlug, email, name, password });
      console.log(
        role === "root"
          ? "Conta criada. No primeiro acesso a /admin, o painel pede a configuração do 2FA."
          : "Conta criada. A dona entra em /admin só com o e-mail e a senha.",
      );
      break;
    }
    case "reset-password": {
      const email = requireEmailArgument(emailArgument);
      const password = await askNewPassword();
      await resetAdminPassword({ email, password });
      console.log("Senha alterada e sessões encerradas.");
      break;
    }
    case "reset-2fa": {
      const email = requireEmailArgument(emailArgument);
      await resetAdminTwoFactor({ email });
      console.log(
        "2FA removido e sessões encerradas. O próximo login pede uma nova configuração.",
      );
      break;
    }
    default:
      console.log(USAGE);
  }
}

main()
  .catch((error: unknown) => {
    if (error instanceof AdminAccountError) console.error(error.message);
    else console.error("Erro inesperado:", error);
    process.exitCode = 1;
  })
  .finally(() => endPools());
