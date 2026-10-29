"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import {
  RESTART_SIGN_IN_CODES,
  authErrorMessage,
} from "@/modules/auth/error-messages";

const totpSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Digite os 6 números do aplicativo."),
});

const backupCodeSchema = z.object({
  code: z.string().trim().min(1, "Digite um código de recuperação."),
});

type CodeValues = z.infer<typeof totpSchema>;

export function TwoFactorForm() {
  const router = useRouter();
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [mustRestart, setMustRestart] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CodeValues>({
    resolver: zodResolver(useBackupCode ? backupCodeSchema : totpSchema),
  });

  async function onSubmit({ code }: CodeValues) {
    setFormError(null);
    const { error } = useBackupCode
      ? await authClient.twoFactor.verifyBackupCode({ code })
      : await authClient.twoFactor.verifyTotp({ code });
    if (error) {
      setFormError(authErrorMessage(error));
      setMustRestart(RESTART_SIGN_IN_CODES.has(error.code ?? ""));
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  function toggleMode() {
    setUseBackupCode((current) => !current);
    setFormError(null);
    reset();
  }

  if (mustRestart) {
    return (
      <div className="grid gap-4">
        <FormError message={formError} />
        <Button asChild>
          <Link href="/admin/entrar">Entrar novamente</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="code">
          {useBackupCode ? "Código de recuperação" : "Código do aplicativo"}
        </Label>
        <Input
          id="code"
          autoComplete="one-time-code"
          inputMode={useBackupCode ? "text" : "numeric"}
          maxLength={useBackupCode ? 32 : 6}
          aria-invalid={Boolean(errors.code)}
          aria-describedby={errors.code ? "code-error" : undefined}
          {...register("code")}
        />
        <FieldError id="code-error" message={errors.code?.message} />
      </div>
      <FormError message={formError} />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Verificando..." : "Verificar"}
      </Button>
      <Button type="button" variant="link" onClick={toggleMode}>
        {useBackupCode
          ? "Usar o código do aplicativo"
          : "Perdeu o celular? Use um código de recuperação"}
      </Button>
    </form>
  );
}
