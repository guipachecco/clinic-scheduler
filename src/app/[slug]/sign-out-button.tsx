"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.replace(`/${slug}`);
    router.refresh();
  }

  return (
    <Button
      type="button"
      size="lg"
      variant="ghost"
      disabled={pending}
      onClick={signOut}
    >
      {pending ? "Saindo..." : "Sair"}
    </Button>
  );
}
