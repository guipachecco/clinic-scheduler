"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/modules/auth/error-messages";
import { loginSchema, type LoginValues } from "@/modules/clients/forms";

import { TextField } from "../text-field";

// Signs in through Better Auth's endpoint, so its rate limit applies.
export function ClientLoginForm({
  next,
  panelMessage = "Essa conta entra pelo painel da clínica.",
}: {
  next: string;
  // Shown to a two-factor (panel) account.
  panelMessage?: string;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginValues) {
    setFormError(null);
    const { data, error } = await authClient.signIn.email(values);
    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    // Panel accounts have two-factor sign-in: they belong in the panel.
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      setFormError(panelMessage);
      return;
    }
    router.replace(next as Route);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <TextField
        id="email"
        label="E-mail"
        type="email"
        autoComplete="username"
        error={errors.email?.message}
        registration={register("email")}
      />
      <TextField
        id="password"
        label="Senha"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        registration={register("password")}
      />
      <FormError message={formError} />
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
