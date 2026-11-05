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

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  if (await getSession()) redirect("/admin");

  return (
    <Card>
      <CardHeader>
        <CardTitle asChild className="text-xl">
          <h1>Entrar no painel</h1>
        </CardTitle>
        <CardDescription>Acesso restrito à equipe da clínica.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
    </Card>
  );
}
