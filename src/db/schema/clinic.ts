import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { createdAt, updatedAt } from "./columns";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const priceDisplay = pgEnum("price_display", [
  "fixed",
  "starting_at",
  "on_request",
  "hidden",
]);

export const timeBlockType = pgEnum("time_block_type", [
  "day_off",
  "vacation",
  "holiday",
  "other",
]);

export const appointmentStatus = pgEnum("appointment_status", [
  "requested",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
]);

// Statuses that hold the time slot. Keep in sync with the
// appointments_no_overlap constraint in the migrations.
export const ACTIVE_APPOINTMENT_STATUSES = ["requested", "confirmed"] as const;

export const appointmentSource = pgEnum("appointment_source", [
  "online",
  "admin",
]);

export const cancellationActor = pgEnum("cancellation_actor", [
  "patient",
  "clinic",
  "system",
]);

export const auditActorType = pgEnum("audit_actor_type", [
  "admin",
  "patient",
  "system",
]);

export const patientGender = pgEnum("patient_gender", [
  "male",
  "female",
  "other",
  "undisclosed",
]);

export const patientReferralSource = pgEnum("patient_referral_source", [
  "google",
  "instagram",
  "facebook",
  "referral",
  "school",
  "outdoor",
  "flyer",
  "sign",
  "insurance",
  "radio",
  "tv",
  "magazine",
  "other",
]);

export const mediaKind = pgEnum("media_kind", ["logo", "photo"]);

// Site images live in the database in the MVP so that they are covered by the
// same backups. Uploads must have their metadata (EXIF) stripped before saving.
export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references((): AnyPgColumn => clinics.id, { onDelete: "restrict" }),
    kind: mediaKind("kind").notNull(),
    mimeType: text("mime_type").notNull(),
    data: bytea("data").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    altText: text("alt_text"),
    createdAt: createdAt(),
  },
  (t) => [
    index("media_clinic_id_idx").on(t.clinicId),
    // Target of the clinics' composite media references below.
    unique("media_clinic_id_id_unique").on(t.clinicId, t.id),
    check(
      "media_mime_type_check",
      sql`${t.mimeType} in ('image/jpeg', 'image/png', 'image/webp')`,
    ),
    check(
      "media_byte_size_check",
      sql`${t.byteSize} > 0 and ${t.byteSize} <= 2097152`,
    ),
    check("media_dimensions_check", sql`${t.width} > 0 and ${t.height} > 0`),
  ],
);

export type ClinicTheme = {
  primaryColor?: string;
  paletteId?: string;
};

// The clinic that existed before multi-clinic support (migration 0007).
export const GRAIS_CLINIC_ID = "00000000-0000-4000-8000-000000000100";

// One row per clinic: identity, site content and booking rules. Every other
// clinic-owned table carries clinic_id. Content fields stay empty until the
// clinic fills them in; nothing is pre-filled.
export const clinics = pgTable(
  "clinics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Public path of the clinic (markhora.com.br/<slug>). It should not change
    // once the clinic is live, because printed QR codes point to it.
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    professionalName: text("professional_name"),
    professionalRegistration: text("professional_registration"),
    headline: text("headline"),
    about: text("about"),
    whatsappPhone: text("whatsapp_phone"),
    contactEmail: text("contact_email"),
    address: text("address"),
    mapsUrl: text("maps_url"),
    // Both media references are composite with the clinic (see the foreign
    // keys below), so a clinic can only point at its own images.
    logoMediaId: uuid("logo_media_id"),
    // Short name and area shown in the panel (e.g. "Karina" / "Manicure");
    // the display name falls back to `name` when empty.
    displayName: text("display_name"),
    areaLabel: text("area_label"),
    ownerPhotoMediaId: uuid("owner_photo_media_id"),
    theme: jsonb("theme").$type<ClinicTheme>().notNull().default({}),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    minAdvanceMinutes: integer("min_advance_minutes").notNull().default(120),
    maxAdvanceDays: integer("max_advance_days").notNull().default(60),
    slotStepMinutes: integer("slot_step_minutes").notNull().default(30),
    cancellationDeadlineMinutes: integer("cancellation_deadline_minutes")
      .notNull()
      .default(1440),
    maxActiveAppointmentsPerPhone: integer("max_active_appointments_per_phone")
      .notNull()
      .default(2),
    onlineBookingEnabled: boolean("online_booking_enabled")
      .notNull()
      .default(false),
    // Clinic page (migration 0017): Instagram handle without the "@", the
    // amenities shown (keys of clinics_amenities_check) and the loyalty card.
    instagramHandle: text("instagram_handle"),
    amenities: text("amenities")
      .array()
      .notNull()
      .default(sql`'{}'`),
    loyaltyEnabled: boolean("loyalty_enabled").notNull().default(false),
    loyaltyVisits: integer("loyalty_visits").notNull().default(10),
    loyaltyReward: text("loyalty_reward"),
    // Health questionnaire template the clinic uses (migration 0024); empty
    // while the clinic has none. Only root/migrations change it.
    anamnesisTemplate: text("anamnesis_template"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // No ON DELETE action: the image is unlinked before it is deleted
    // (src/modules/branding/photo.ts).
    foreignKey({
      name: "clinics_logo_media_fk",
      columns: [t.id, t.logoMediaId],
      foreignColumns: [media.clinicId, media.id],
    }),
    foreignKey({
      name: "clinics_owner_photo_media_fk",
      columns: [t.id, t.ownerPhotoMediaId],
      foreignColumns: [media.clinicId, media.id],
    }),
    check("clinics_slug_check", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("clinics_name_check", sql`char_length(${t.name}) between 1 and 100`),
    check(
      "clinics_display_name_check",
      sql`${t.displayName} is null or char_length(${t.displayName}) between 1 and 40`,
    ),
    check(
      "clinics_area_label_check",
      sql`${t.areaLabel} is null or char_length(${t.areaLabel}) between 1 and 40`,
    ),
    check("clinics_min_advance_check", sql`${t.minAdvanceMinutes} >= 0`),
    check(
      "clinics_max_advance_check",
      sql`${t.maxAdvanceDays} between 1 and 365`,
    ),
    check(
      "clinics_slot_step_check",
      sql`${t.slotStepMinutes} between 5 and 240`,
    ),
    check(
      "clinics_cancellation_deadline_check",
      sql`${t.cancellationDeadlineMinutes} >= 0`,
    ),
    check(
      "clinics_max_active_check",
      sql`${t.maxActiveAppointmentsPerPhone} between 1 and 20`,
    ),
    check(
      "clinics_instagram_check",
      sql`${t.instagramHandle} is null or ${t.instagramHandle} ~ '^[A-Za-z0-9._]{1,30}$'`,
    ),
    check(
      "clinics_amenities_check",
      sql`${t.amenities} <@ ARRAY['wifi', 'estacionamento', 'acessibilidade', 'ar_condicionado', 'cafe_agua', 'banheiro', 'espaco_kids', 'aceita_pets']::text[]`,
    ),
    check(
      "clinics_loyalty_visits_check",
      sql`${t.loyaltyVisits} between 2 and 50`,
    ),
    check(
      "clinics_loyalty_reward_check",
      sql`${t.loyaltyReward} is null or char_length(${t.loyaltyReward}) <= 120`,
    ),
    check(
      "clinics_loyalty_check",
      sql`not ${t.loyaltyEnabled} or ${t.loyaltyReward} is not null`,
    ),
    check(
      "clinics_maps_url_check",
      sql`${t.mapsUrl} is null or ${t.mapsUrl} ~ '^https://'`,
    ),
  ],
);

export const serviceCategories = pgTable(
  "service_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("service_categories_clinic_slug_unique").on(t.clinicId, t.slug),
    unique("service_categories_clinic_id_id_unique").on(t.clinicId, t.id),
    check(
      "service_categories_slug_check",
      sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
  ],
);

// Slugs of the rows every clinic gets: seeded for the first clinic by
// migration 0005_flexible_service_seed and by createClinic for new ones.
export const FLEXIBLE_SERVICE_SLUG = "avaliacao-encaixe";
export const OTHER_CATEGORY_SLUG = "outros";

// Services are deactivated, never deleted, once they have appointments.
export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull(),
    bufferBeforeMinutes: integer("buffer_before_minutes").notNull().default(0),
    bufferAfterMinutes: integer("buffer_after_minutes").notNull().default(0),
    priceCents: integer("price_cents"),
    priceDisplay: priceDisplay("price_display").notNull().default("hidden"),
    requiresApproval: boolean("requires_approval").notNull().default(true),
    onlineBookingEnabled: boolean("online_booking_enabled")
      .notNull()
      .default(true),
    preparationInstructions: text("preparation_instructions"),
    isFlexible: boolean("is_flexible").notNull().default(false),
    isActive: boolean("is_active").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "services_category_fk",
      columns: [t.clinicId, t.categoryId],
      foreignColumns: [serviceCategories.clinicId, serviceCategories.id],
    }).onDelete("restrict"),
    unique("services_clinic_slug_unique").on(t.clinicId, t.slug),
    unique("services_clinic_id_id_unique").on(t.clinicId, t.id),
    index("services_category_id_idx").on(t.categoryId),
    check("services_slug_check", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check(
      "services_duration_check",
      sql`${t.durationMinutes} between 5 and 720`,
    ),
    check(
      "services_buffers_check",
      sql`${t.bufferBeforeMinutes} between 0 and 240 and ${t.bufferAfterMinutes} between 0 and 240`,
    ),
    check(
      "services_price_check",
      sql`${t.priceCents} is null or ${t.priceCents} >= 0`,
    ),
    check(
      "services_price_display_check",
      sql`${t.priceDisplay} in ('on_request', 'hidden') or ${t.priceCents} is not null`,
    ),
  ],
);

// Optional weekly windows for a service, e.g. "only on Tuesday mornings".
// Weekday: 0 = Sunday ... 6 = Saturday. Times are local to the clinic timezone.
export const serviceAvailability = pgTable(
  "service_availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
  },
  (t) => [
    index("service_availability_service_id_idx").on(t.serviceId, t.weekday),
    check(
      "service_availability_weekday_check",
      sql`${t.weekday} between 0 and 6`,
    ),
    check(
      "service_availability_time_check",
      sql`${t.startTime} < ${t.endTime}`,
    ),
  ],
);

// Weekly opening hours; a day may have several intervals (e.g. 8-12 and 13:30-18).
export const businessHours = pgTable(
  "business_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    weekday: smallint("weekday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
  },
  (t) => [
    index("business_hours_weekday_idx").on(t.clinicId, t.weekday),
    check("business_hours_weekday_check", sql`${t.weekday} between 0 and 6`),
    check("business_hours_time_check", sql`${t.startTime} < ${t.endTime}`),
  ],
);

export const timeBlocks = pgTable(
  "time_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    type: timeBlockType("type").notNull(),
    title: text("title"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("time_blocks_period_idx").on(t.clinicId, t.startsAt, t.endsAt),
    check("time_blocks_period_check", sql`${t.startsAt} < ${t.endsAt}`),
  ],
);

// Patient registry: name, phone in E.164 and optional contact, document and
// marketing data. A patient is identified by phone + normalized name (the CPF,
// when present, is also unique). Anonymization clears every personal field and
// replaces the name with a fixed label.
export const patients = pgTable(
  "patients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    nameNormalized: text("name_normalized"),
    phone: text("phone"),
    email: text("email"),
    nickname: text("nickname"),
    cpf: text("cpf"),
    rg: text("rg"),
    landlinePhone: text("landline_phone"),
    birthDate: date("birth_date", { mode: "string" }),
    gender: patientGender("gender"),
    referralSource: patientReferralSource("referral_source"),
    referredBy: text("referred_by"),
    notes: text("notes"),
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
    // The client account that books online as this patient (one per clinic).
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // On a provisional record from an online signup: the existing patient
    // whose phone it matched, until the owner says whether it is the same
    // person. Same clinic only (composite reference).
    pendingLinkPatientId: uuid("pending_link_patient_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("patients_clinic_id_id_unique").on(t.clinicId, t.id),
    foreignKey({
      name: "patients_pending_link_fk",
      columns: [t.clinicId, t.pendingLinkPatientId],
      foreignColumns: [t.clinicId, t.id],
    }).onDelete("restrict"),
    uniqueIndex("patients_user_id_idx")
      .on(t.clinicId, t.userId)
      .where(sql`${t.userId} is not null`),
    // A provisional record may repeat the name and phone it matched.
    uniqueIndex("patients_phone_name_idx")
      .on(t.clinicId, t.phone, t.nameNormalized)
      .where(sql`${t.pendingLinkPatientId} is null`),
    uniqueIndex("patients_cpf_idx")
      .on(t.clinicId, t.cpf)
      .where(sql`${t.cpf} is not null`),
    check(
      "patients_identity_check",
      sql`${t.anonymizedAt} is not null or (${t.phone} is not null and ${t.nameNormalized} is not null)`,
    ),
    check(
      "patients_anonymized_check",
      sql`${t.anonymizedAt} is null or (${t.phone} is null and ${t.email} is null and ${t.nameNormalized} is null and ${t.nickname} is null and ${t.cpf} is null and ${t.rg} is null and ${t.landlinePhone} is null and ${t.birthDate} is null and ${t.gender} is null and ${t.referralSource} is null and ${t.referredBy} is null and ${t.notes} is null and ${t.userId} is null)`,
    ),
    check(
      "patients_phone_check",
      sql`${t.phone} is null or ${t.phone} ~ '^\\+[1-9][0-9]{7,14}$'`,
    ),
    check(
      "patients_landline_check",
      sql`${t.landlinePhone} is null or ${t.landlinePhone} ~ '^\\+[1-9][0-9]{7,14}$'`,
    ),
    check(
      "patients_cpf_check",
      sql`${t.cpf} is null or ${t.cpf} ~ '^[0-9]{11}$'`,
    ),
    check(
      "patients_referred_by_check",
      sql`${t.referredBy} is null or ${t.referralSource} = 'referral'`,
    ),
    check(
      "patients_lengths_check",
      sql`char_length(${t.nickname}) <= 40 and char_length(${t.rg}) <= 20 and char_length(${t.referredBy}) <= 120 and char_length(${t.notes}) <= 1000`,
    ),
  ],
);

// Photos of the clinic's space and work, shown on its public page in
// position order; the first one is the cover. The image itself lives in
// media. Clients read them only through the definer functions of migration
// 0020, never this table.
export const clinicPhotos = pgTable(
  "clinic_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    mediaId: uuid("media_id").notNull(),
    position: integer("position").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("clinic_photos_clinic_position_idx").on(t.clinicId, t.position),
    unique("clinic_photos_media_unique").on(t.mediaId),
    foreignKey({
      name: "clinic_photos_media_fk",
      columns: [t.clinicId, t.mediaId],
      foreignColumns: [media.clinicId, media.id],
    }).onDelete("restrict"),
    check("clinic_photos_position_check", sql`${t.position} >= 0`),
  ],
);

// Products the clinic sells, listed on its public page. Clients see only the
// active ones (policy products_client, migration 0017).
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    priceCents: integer("price_cents"),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("products_clinic_id_idx").on(t.clinicId),
    check("products_name_check", sql`char_length(${t.name}) between 1 and 80`),
    check(
      "products_price_check",
      sql`${t.priceCents} is null or ${t.priceCents} between 0 and 10000000`,
    ),
    check(
      "products_description_check",
      sql`${t.description} is null or char_length(${t.description}) <= 300`,
    ),
  ],
);

// A client's review of the clinic. She may write one after a completed
// appointment, as many as she likes (policy reviews_client_insert, migration
// 0017). The panel only hides a review, never edits it (it moves patient_id
// only when merging a provisional record, migration 0018); hidden reviews and
// those of an anonymized patient are neither shown nor counted.
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id").notNull(),
    patientId: uuid("patient_id").notNull(),
    rating: smallint("rating").notNull(),
    comment: text("comment"),
    isHidden: boolean("is_hidden").notNull().default(false),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenBy: uuid("hidden_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "reviews_patient_fk",
      columns: [t.clinicId, t.patientId],
      foreignColumns: [patients.clinicId, patients.id],
    }).onDelete("restrict"),
    index("reviews_clinic_created_at_idx").on(t.clinicId, t.createdAt),
    check("reviews_rating_check", sql`${t.rating} between 1 and 5`),
    check(
      "reviews_comment_check",
      sql`${t.comment} is null or char_length(${t.comment}) <= 500`,
    ),
  ],
);

// Each loyalty reward a patient received, recorded by the panel.
export const loyaltyRedemptions = pgTable(
  "loyalty_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id").notNull(),
    patientId: uuid("patient_id").notNull(),
    createdAt: createdAt(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    foreignKey({
      name: "loyalty_redemptions_patient_fk",
      columns: [t.clinicId, t.patientId],
      foreignColumns: [patients.clinicId, patients.id],
    }).onDelete("restrict"),
    index("loyalty_redemptions_patient_idx").on(t.clinicId, t.patientId),
  ],
);

export const CANCELLATION_REASONS = [
  "patient_request",
  "rescheduled",
  "clinic_unavailable",
  "other",
] as const;

// occupied_from/occupied_until include the preparation and cleanup buffers.
// The appointments_no_overlap exclusion constraint (custom migration) rejects
// two active appointments of the same clinic whose occupied ranges overlap.
export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id").notNull(),
    serviceId: uuid("service_id").notNull(),
    serviceName: text("service_name").notNull(),
    serviceDurationMinutes: integer("service_duration_minutes").notNull(),
    // Free-text name for flexible services. Never health information.
    customLabel: text("custom_label"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    occupiedFrom: timestamp("occupied_from", { withTimezone: true }).notNull(),
    occupiedUntil: timestamp("occupied_until", {
      withTimezone: true,
    }).notNull(),
    status: appointmentStatus("status").notNull().default("requested"),
    source: appointmentSource("source").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: cancellationActor("cancelled_by"),
    cancellationReason: text("cancellation_reason"),
    // SHA-256 of the patient's management link token; the token itself is never stored.
    manageTokenHash: text("manage_token_hash").unique(),
    idempotencyKey: uuid("idempotency_key").unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "appointments_patient_fk",
      columns: [t.clinicId, t.patientId],
      foreignColumns: [patients.clinicId, patients.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "appointments_service_fk",
      columns: [t.clinicId, t.serviceId],
      foreignColumns: [services.clinicId, services.id],
    }).onDelete("restrict"),
    unique("appointments_clinic_id_id_unique").on(t.clinicId, t.id),
    index("appointments_starts_at_idx").on(t.clinicId, t.startsAt),
    index("appointments_patient_id_idx").on(t.patientId),
    index("appointments_service_id_idx").on(t.serviceId),
    check("appointments_period_check", sql`${t.startsAt} < ${t.endsAt}`),
    check(
      "appointments_occupied_check",
      sql`${t.occupiedFrom} <= ${t.startsAt} and ${t.occupiedUntil} >= ${t.endsAt}`,
    ),
    check(
      "appointments_cancellation_check",
      sql`(${t.status} = 'cancelled') = (${t.cancelledAt} is not null and ${t.cancelledBy} is not null)`,
    ),
    check(
      "appointments_custom_label_check",
      sql`${t.customLabel} is null or char_length(${t.customLabel}) between 1 and 60`,
    ),
    check(
      "appointments_cancellation_reason_check",
      sql`${t.cancellationReason} is null or ${t.cancellationReason} in ('patient_request','rescheduled','clinic_unavailable','other')`,
    ),
  ],
);

// Who changed what and when. `changes` must never contain personal data:
// store ids, statuses and times only.
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Empty for actions outside any clinic (root and account management).
    clinicId: uuid("clinic_id").references(() => clinics.id, {
      onDelete: "restrict",
    }),
    actorType: auditActorType("actor_type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    changes: jsonb("changes").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_clinic_id_idx").on(t.clinicId, t.createdAt),
    index("audit_logs_created_at_idx").on(t.createdAt),
  ],
);
