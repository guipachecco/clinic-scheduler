"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { takeChanged } from "./latest";

// The browser's back button shows the patient's record from the client router
// cache: when an anamnesis of the patient changed since, ask the server again
// so the list does not show the old situation or date.
export function RefreshWhenChanged({ patientId }: { patientId: string }) {
  const router = useRouter();
  useEffect(() => {
    if (takeChanged(patientId)) router.refresh();
  }, [patientId, router]);
  return null;
}
