"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/modules/auth/error-messages";
import { forgotSchema, type ForgotValues } from "@/modules/clients/forms";

import { TextField } from "../text-field";

// The answer is the same whether the account exists or not.
const SENT =
  "Se existir uma conta com esse e-mail, enviamos um link para criar uma nova senha. Confira também a caixa de spam.";

export function ForgotPasswordForm({ slug }: { slug: string }) {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema) });

  async function onSubmit(values: ForgotValues) {
    setFormError(null);
    // Through Better Auth's endpoint (rate limited). The e-mail links to this
    // clinic's page (src/modules/clients/auth-emails.ts).
    const { error } = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: `/${slug}/nova-senha`,
    });
    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <p role="status" className="rounded-2xl border bg-card p-4">
        {SENT}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <TextField
        id="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        registration={register("email")}
      />
      <FormError message={formError} />
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Enviando..." : "Enviar link"}
      </Button>
    </form>
  );
}
