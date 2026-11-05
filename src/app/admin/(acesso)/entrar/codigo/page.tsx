import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSession } from "@/modules/auth/session";

import { TwoFactorForm } from "./two-factor-form";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

export default async function TwoFactorPage() {
  if (await getSession()) redirect("/admin");

  return (
    <Card>
      <CardHeader>
        <CardTitle asChild className="text-xl">
          <h1>Verificação em duas etapas</h1>
        </CardTitle>
        <CardDescription>
          Digite o código de 6 números que aparece no aplicativo autenticador.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TwoFactorForm />
      </CardContent>
    </Card>
  );
}
