import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getClientUser, requireClinic } from "@/modules/clients/session";

import { SignOutButton } from "./sign-out-button";
import { clinicName, PageTitle, Unavailable } from "./ui";

// The clinic link's entry: book, sign in or create an account. With online
// booking switched off, the clinic's contacts instead.
export default async function ClinicEntryPage({
  params,
}: PageProps<"/[slug]">) {
  const clinic = await requireClinic((await params).slug);
  if (!clinic.onlineBookingEnabled) return <Unavailable clinic={clinic} />;
  const user = await getClientUser();

  return (
    <>
      <PageTitle
        description={
          user
            ? `Olá, ${user.name}.`
            : `Marque seu horário com ${clinicName(clinic)} pela internet.`
        }
      >
        Agende seu horário
      </PageTitle>
      <nav aria-label="Área da cliente" className="grid gap-3">
        <Button asChild size="lg">
          <Link href={`/${clinic.slug}/marcar`}>Marcar horário</Link>
        </Button>
        {user ? (
          <>
            <Button asChild size="lg" variant="outline">
              <Link href={`/${clinic.slug}/meus-horarios`}>Meus horários</Link>
            </Button>
            <SignOutButton slug={clinic.slug} />
          </>
        ) : (
          <>
            <Button asChild size="lg" variant="outline">
              <Link href={`/${clinic.slug}/entrar`}>Entrar</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={`/${clinic.slug}/cadastro`}>Criar conta</Link>
            </Button>
          </>
        )}
      </nav>
    </>
  );
}
