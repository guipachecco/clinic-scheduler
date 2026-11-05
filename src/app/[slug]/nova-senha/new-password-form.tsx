"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/modules/auth/error-messages";
import {
  newPasswordSchema,
  type NewPasswordValues,
} from "@/modules/clients/forms";

import { TextField } from "../text-field";

const EXPIRED =
  "O link venceu ou já foi usado. Peça um novo em Esqueci minha senha.";

export function NewPasswordForm({
  slug,
  token,
}: {
  slug: string;
  token: string;
}) {
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordValues>({ resolver: zodResolver(newPasswordSchema) });

  async function onSubmit(values: NewPasswordValues) {
    setFormError(null);
    // Better Auth ends her other sessions (revokeSessionsOnPasswordReset).
    const { error } = await authClient.resetPassword({
      newPassword: values.password,
      token,
    });
    if (error) {
      setFormError(
        error.code === "INVALID_TOKEN" ? EXPIRED : authErrorMessage(error),
      );
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div role="status" className="grid gap-3 rounded-2xl border bg-card p-4">
        <p>Senha alterada. Entre com a nova senha.</p>
        <Button asChild size="lg">
          <Link href={`/${slug}/entrar`}>Entrar</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <TextField
        id="password"
        label="Nova senha"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        registration={register("password")}
      />
      <TextField
        id="confirm"
        label="Repita a nova senha"
        type="password"
        autoComplete="new-password"
        error={errors.confirm?.message}
        registration={register("confirm")}
      />
      <FormError message={formError} />
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Salvando..." : "Salvar nova senha"}
      </Button>
    </form>
  );
}
