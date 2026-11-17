"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import { requireRoot } from "@/modules/auth/session";
import { setClinicModule } from "@/modules/clinics/clinics";
import { CLINIC_MODULES } from "@/modules/clinics/modules";

// Root only: one switch of the resources screen.

const inputSchema = z.object({
  clinicId: z.uuid(),
  module: z.enum(CLINIC_MODULES),
  on: z.boolean(),
});

export async function setModuleAction(input: {
  clinicId: string;
  module: string;
  on: boolean;
}): Promise<{ ok: boolean }> {
  const session = await requireRoot();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  try {
    const result = await setClinicModule(
      parsed.data.clinicId,
      parsed.data.module,
      parsed.data.on,
      session.user.id,
    );
    revalidatePath("/admin/recursos");
    return result;
  } catch {
    return { ok: false };
  }
}
