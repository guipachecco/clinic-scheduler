"use client";

import { useState, useTransition } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PasswordInput } from "@/components/ui/password-input";
import type {
  ClinicAccount,
  ClinicAccountKind,
} from "@/modules/auth/admin-accounts";
import { generatePassword } from "@/modules/auth/generate-password";
import { MIN_PASSWORD_LENGTH } from "@/modules/auth/password-policy";

import { setPasswordAction } from "./actions";

// Pick the account, type or generate the new password, save.
export function PasswordForm({
  clinicId,
  kind,
  accounts,
}: {
  clinicId: string;
  kind: ClinicAccountKind;
  accounts: ClinicAccount[];
}) {
  const [userId, setUserId] = useState(accounts[0]?.id ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await setPasswordAction({
        clinicId,
        kind,
        userId,
        password,
      }).catch(() => ({
        ok: false as const,
        error: "Sem conexão. Tente de novo.",
      }));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const account = accounts.find((a) => a.id === userId);
      setNotice(
        `Senha de ${account?.email ?? "conta"} trocada. As sessões abertas foram encerradas.`,
      );
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setNotice("Senha copiada.");
    } catch {
      window.prompt("Copie a senha:", password);
    }
  }

  return (
    <form onSubmit={save} noValidate className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="senha-conta">Conta</Label>
        <NativeSelect
          id="senha-conta"
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} · {account.email}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="senha-nova">Nova senha</Label>
        <PasswordInput
          id="senha-nova"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-describedby="senha-nova-dica"
        />
        <p id="senha-nova-dica" className="text-sm text-muted-foreground">
          Pelo menos {MIN_PASSWORD_LENGTH} caracteres.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setPassword(generatePassword());
              setNotice(null);
            }}
          >
            Gerar senha
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!password}
            onClick={copy}
          >
            Copiar senha
          </Button>
        </div>
      </div>
      <FormError message={error} />
      {notice ? (
        <p role="status" className="text-sm font-medium text-foreground">
          {notice}
        </p>
      ) : null}
      <Button type="submit" disabled={pending || !userId}>
        {pending ? "Salvando..." : "Salvar senha"}
      </Button>
    </form>
  );
}
