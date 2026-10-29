"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/modules/auth/error-messages";

type Enrollment = {
  qrCodeDataUrl: string;
  secret: string;
  backupCodes: string[];
};

const passwordSchema = z.object({
  password: z.string().min(1, "Informe a senha."),
});

const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Digite os 6 números do aplicativo."),
});

export function TwoFactorSetup() {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);

  if (!enrollment) return <PasswordStep onEnrolled={setEnrollment} />;
  return <VerifyStep enrollment={enrollment} />;
}

// Step 1: confirms the password and creates a new authenticator secret.
function PasswordStep({
  onEnrolled,
}: {
  onEnrolled: (enrollment: Enrollment) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
  });

  async function onSubmit({ password }: z.infer<typeof passwordSchema>) {
    setFormError(null);
    const { data, error } = await authClient.twoFactor.enable({ password });
    if (error || !data || !("totpURI" in data) || !data.totpURI) {
      setFormError(
        error
          ? authErrorMessage(error)
          : "Não foi possível concluir. Tente novamente.",
      );
      return;
    }
    const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
    onEnrolled({
      qrCodeDataUrl: await QRCode.toDataURL(data.totpURI, {
        margin: 1,
        width: 224,
      }),
      secret,
      backupCodes: data.backupCodes ?? [],
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="password">Confirme sua senha</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "password-error" : undefined}
          {...register("password")}
        />
        <FieldError id="password-error" message={errors.password?.message} />
      </div>
      <FormError message={formError} />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Gerando..." : "Continuar"}
      </Button>
    </form>
  );
}

// Step 2: shows the QR code and the recovery codes, then checks the first code.
function VerifyStep({ enrollment }: { enrollment: Enrollment }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof codeSchema>>({
    resolver: zodResolver(codeSchema),
  });

  async function onSubmit({ code }: z.infer<typeof codeSchema>) {
    setFormError(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <h2 className="font-medium">1. Leia o QR code no aplicativo</h2>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated in the browser */}
        <img
          src={enrollment.qrCodeDataUrl}
          alt="QR code para cadastrar o painel no aplicativo autenticador"
          width={224}
          height={224}
          className="rounded-md border"
        />
        <p className="text-sm text-muted-foreground">
          Se não conseguir ler, digite esta chave no aplicativo:
        </p>
        <code
          id="totp-secret"
          className="rounded-md border p-3 font-mono text-sm break-all"
        >
          {enrollment.secret}
        </code>
      </section>

      <section className="grid gap-3">
        <h2 className="font-medium">2. Guarde os códigos de recuperação</h2>
        <p className="text-sm text-muted-foreground">
          Se perder o celular, cada código abaixo permite entrar uma vez. Anote
          ou guarde num gerenciador de senhas. Eles não serão mostrados de novo.
        </p>
        <ul className="grid grid-cols-2 gap-2 rounded-md border p-3 font-mono text-sm">
          {enrollment.backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </section>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-3">
        <h2 className="font-medium">3. Confirme com o código do aplicativo</h2>
        <div className="grid gap-2">
          <Label htmlFor="code">Código de 6 números</Label>
          <Input
            id="code"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            aria-invalid={Boolean(errors.code)}
            aria-describedby={errors.code ? "code-error" : undefined}
            {...register("code")}
          />
          <FieldError id="code-error" message={errors.code?.message} />
        </div>
        <FormError message={formError} />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Verificando..." : "Ativar e entrar no painel"}
        </Button>
      </form>
    </div>
  );
}
