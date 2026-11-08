"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  useForm,
  type FieldValues,
  type Path,
  type UseFormSetError,
} from "react-hook-form";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import {
  completeSchema,
  signupSchema,
  type CompleteValues,
  type SignupValues,
} from "@/modules/clients/forms";
import { safeNext } from "@/modules/clients/safe-next";

import { TextField } from "../text-field";

import { completeRegistration, signUp } from "./actions";

const GENERIC_ERROR = "Não foi possível concluir. Tente novamente.";

const legalLinkClass =
  "font-semibold text-primary underline underline-offset-4";

// Under the buttons that create the account or the clinic record.
function LegalNotice() {
  return (
    <p className="text-center text-xs text-muted-foreground">
      Ao continuar, você concorda com os{" "}
      <Link href="/termos" target="_blank" className={legalLinkClass}>
        Termos de uso
      </Link>{" "}
      e com a{" "}
      <Link href="/privacidade" target="_blank" className={legalLinkClass}>
        Política de privacidade
      </Link>
      .
    </p>
  );
}

// Puts a Server Action's field errors on the form; returns the form-level one.
function applyFieldErrors<T extends FieldValues>(
  fieldErrors: Record<string, string>,
  fields: readonly string[],
  setError: UseFormSetError<T>,
): string | null {
  let formError: string | null = null;
  for (const [field, message] of Object.entries(fieldErrors)) {
    if (fields.includes(field)) setError(field as Path<T>, { message });
    else formError ??= message;
  }
  return formError;
}

// `next` is where she goes once the account exists (validated again here:
// only a path of this clinic, else the booking page).
export function SignupForm({ slug, next }: { slug: string; next: string }) {
  const router = useRouter();
  const destination = safeNext(slug, next) ?? `/${slug}/marcar`;
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({ resolver: zodResolver(signupSchema) });

  async function onSubmit(values: SignupValues) {
    setFormError(null);
    let result;
    try {
      result = await signUp(slug, values);
    } catch {
      setFormError(GENERIC_ERROR);
      return;
    }
    if (!result.ok) {
      setFormError(
        applyFieldErrors(result.fieldErrors, Object.keys(values), setError),
      );
      return;
    }
    const { error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
    });
    if (error) {
      // The account exists: she can sign in on the next page.
      router.push(
        `/${slug}/entrar?next=${encodeURIComponent(destination)}` as Route,
      );
      return;
    }
    router.replace(destination as Route);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <TextField
        id="name"
        label="Nome"
        autoComplete="name"
        error={errors.name?.message}
        registration={register("name")}
      />
      <TextField
        id="phone"
        label="Celular (WhatsApp)"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        error={errors.phone?.message}
        placeholder="(11) 98765-4321"
        registration={register("phone")}
      />
      <TextField
        id="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        registration={register("email")}
      />
      <TextField
        id="password"
        label="Senha"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        registration={register("password")}
      />
      <FormError message={formError} />
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Criando..." : "Criar conta"}
      </Button>
      <LegalNotice />
    </form>
  );
}

export function CompleteForm({
  slug,
  next,
  defaultName,
}: {
  slug: string;
  next: string;
  defaultName: string;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CompleteValues>({
    resolver: zodResolver(completeSchema),
    defaultValues: { name: defaultName, phone: "" },
  });

  async function onSubmit(values: CompleteValues) {
    setFormError(null);
    // Success redirects; only failures come back.
    const result = await completeRegistration(slug, values, next);
    setFormError(
      applyFieldErrors(result.fieldErrors, Object.keys(values), setError),
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <TextField
        id="name"
        label="Nome"
        autoComplete="name"
        error={errors.name?.message}
        registration={register("name")}
      />
      <TextField
        id="phone"
        label="Celular (WhatsApp)"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        error={errors.phone?.message}
        placeholder="(11) 98765-4321"
        registration={register("phone")}
      />
      <FormError message={formError} />
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Salvando..." : "Continuar"}
      </Button>
      <LegalNotice />
    </form>
  );
}
