import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
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
};

// Single row (id = 1) with the site content and the booking rules. Content
// fields stay empty until the clinic fills them in; nothing is pre-filled.
export const clinicSettings = pgTable(
  "clinic_settings",
  {
    id: smallint("id").primaryKey().default(1),
    clinicName: text("clinic_name"),
    professionalName: text("professional_name"),
    professionalRegistration: text("professional_registration"),
    headline: text("headline"),
    about: text("about"),
    whatsappPhone: text("whatsapp_phone"),
    contactEmail: text("contact_email"),
    address: text("address"),
    mapsUrl: text("maps_url"),
    logoMediaId: uuid("logo_media_id").references(() => media.id, {
      onDelete: "set null",
    }),
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
    updatedAt: updatedAt(),
  },
  (t) => [
    check("clinic_settings_singleton_check", sql`${t.id} = 1`),
    check(
      "clinic_settings_min_advance_check",
      sql`${t.minAdvanceMinutes} >= 0`,
    ),
    check(
      "clinic_settings_max_advance_check",
      sql`${t.maxAdvanceDays} between 1 and 365`,
    ),
    check(
      "clinic_settings_slot_step_check",
      sql`${t.slotStepMinutes} between 5 and 240`,
    ),
    check(
      "clinic_settings_cancellation_deadline_check",
      sql`${t.cancellationDeadlineMinutes} >= 0`,
    ),
    check(
      "clinic_settings_max_active_check",
      sql`${t.maxActiveAppointmentsPerPhone} between 1 and 20`,
    ),
  ],
);

export const serviceCategories = pgTable(
  "service_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "service_categories_slug_check",
      sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
  ],
);

// Slugs of the rows seeded by migration 0005_flexible_service_seed.
export const FLEXIBLE_SERVICE_SLUG = "avaliacao-encaixe";
export const OTHER_CATEGORY_SLUG = "outros";

// Services are deactivated, never deleted, once they have appointments.
export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => serviceCategories.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
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
    weekday: smallint("weekday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
  },
  (t) => [
    index("business_hours_weekday_idx").on(t.weekday),
    check("business_hours_weekday_check", sql`${t.weekday} between 0 and 6`),
    check("business_hours_time_check", sql`${t.startTime} < ${t.endTime}`),
  ],
);

export const timeBlocks = pgTable(
  "time_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
    index("time_blocks_period_idx").on(t.startsAt, t.endsAt),
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
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("patients_phone_name_idx").on(t.phone, t.nameNormalized),
    uniqueIndex("patients_cpf_idx")
      .on(t.cpf)
      .where(sql`${t.cpf} is not null`),
    check(
      "patients_identity_check",
      sql`${t.anonymizedAt} is not null or (${t.phone} is not null and ${t.nameNormalized} is not null)`,
    ),
    check(
      "patients_anonymized_check",
      sql`${t.anonymizedAt} is null or (${t.phone} is null and ${t.email} is null and ${t.nameNormalized} is null and ${t.nickname} is null and ${t.cpf} is null and ${t.rg} is null and ${t.landlinePhone} is null and ${t.birthDate} is null and ${t.gender} is null and ${t.referralSource} is null and ${t.referredBy} is null and ${t.notes} is null)`,
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

// occupied_from/occupied_until include the preparation and cleanup buffers.
// The appointments_no_overlap exclusion constraint (custom migration) rejects
// two active appointments whose occupied ranges overlap.
export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "restrict" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    serviceName: text("service_name").notNull(),
    serviceDurationMinutes: integer("service_duration_minutes").notNull(),
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
    index("appointments_starts_at_idx").on(t.startsAt),
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
  ],
);

// Who changed what and when. `changes` must never contain personal data:
// store ids, statuses and times only.
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
    index("audit_logs_created_at_idx").on(t.createdAt),
  ],
);
