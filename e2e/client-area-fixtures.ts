import type { Client } from "pg";

// Fictitious clinics of the client-area suite (e2e/client-area.spec.ts),
// seeded by e2e/global-setup.ts. A and B take online bookings every day from
// 06:00 to 22:00 with no minimum advance, so a slot is always free in the
// next days; "off" has online booking switched off.
export const CLIENT_AREA = {
  a: {
    slug: "clinica-cliente-a",
    name: "Clínica Cliente A (teste)",
    displayName: "Clínica A",
    whatsapp: "+5511987650001",
    email: "contato-a@example.test",
    address: "Rua Fictícia, 100 - São Paulo",
    service: "Limpeza de pele (teste)",
    preparation: "Venha sem maquiagem.",
  },
  b: {
    slug: "clinica-cliente-b",
    name: "Clínica Cliente B (teste)",
    displayName: "Clínica B",
    whatsapp: "+5511987650002",
    email: "contato-b@example.test",
    address: "Avenida Fictícia, 200 - São Paulo",
    service: "Massagem relaxante (teste)",
    preparation: null,
  },
  off: {
    slug: "clinica-cliente-desligada",
    name: "Clínica Sem Online (teste)",
    displayName: "Clínica Sem Online",
    whatsapp: "+5511987650003",
    email: "contato-off@example.test",
    address: null,
    service: null,
    preparation: null,
  },
} as const;

export async function seedClientAreaClinics(client: Client) {
  for (const [key, clinic] of Object.entries(CLIENT_AREA)) {
    const online = key !== "off";
    const {
      rows: [row],
    } = await client.query<{ id: string }>(
      `INSERT INTO clinics (slug, name, display_name, whatsapp_phone,
         contact_email, address, online_booking_choice, min_advance_minutes,
         max_advance_days, slot_step_minutes,
         max_active_appointments_per_phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 30, 30, 5)
       RETURNING id`,
      [
        clinic.slug,
        clinic.name,
        clinic.displayName,
        clinic.whatsapp,
        clinic.email,
        clinic.address,
        online,
      ],
    );
    const clinicId = row!.id;
    for (let weekday = 0; weekday <= 6; weekday++) {
      await client.query(
        `INSERT INTO business_hours (clinic_id, weekday, start_time, end_time)
         VALUES ($1, $2, '06:00', '22:00')`,
        [clinicId, weekday],
      );
    }
    if (!clinic.service) continue;
    const {
      rows: [category],
    } = await client.query<{ id: string }>(
      `INSERT INTO service_categories (clinic_id, name, slug)
       VALUES ($1, 'Estética (teste)', 'estetica-teste') RETURNING id`,
      [clinicId],
    );
    await client.query(
      `INSERT INTO services (clinic_id, category_id, name, slug,
         duration_minutes, price_cents, price_display, requires_approval,
         online_booking_enabled, preparation_instructions, is_active)
       VALUES ($1, $2, $3, 'servico-teste', 60, 15000, 'fixed', true, true,
         $4, true)`,
      [clinicId, category!.id, clinic.service, clinic.preparation],
    );
  }
}
