import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSessionPendingTwoFactor } from "@/modules/auth/session";

import { TwoFactorSetup } from "./two-factor-setup";

export const metadata: Metadata = {
  title: "Configurar verificação em duas etapas",
};

export default async function TwoFactorSetupPage() {
  await requireSessionPendingTwoFactor();

  return (
    <Card>
      <CardHeader>
        <CardTitle asChild className="text-xl">
          <h1>Configure a verificação em duas etapas</h1>
        </CardTitle>
        <CardDescription>
          O painel guarda dados de pacientes. Além da senha, cada acesso vai
          pedir um código gerado no seu celular por um aplicativo autenticador,
          como Google Authenticator ou Microsoft Authenticator.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TwoFactorSetup />
      </CardContent>
    </Card>
  );
}
