import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import type { Answers } from "@/modules/anamnesis/fields";

import { users } from "./auth";
import { clinics, patients } from "./clinic";
import { createdAt, updatedAt } from "./columns";

export const anamnesisStatus = pgEnum("anamnesis_status", [
  "in_progress",
  "completed",
]);

// A patient's health questionnaire, filled in by the clinic's panel. Several
// per patient (one per visit date). The answers are free-form and validated by
// the template in the app; the database only caps their size. Clients never
// reach this table.
export const anamneses = pgTable(
  "anamneses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id").notNull(),
    template: text("template").notNull(),
    takenOn: date("taken_on", { mode: "string" }).notNull(),
    status: anamnesisStatus("status").notNull().default("in_progress"),
    answers: jsonb("answers").$type<Answers>().notNull().default({}),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "anamneses_patient_fk",
      columns: [t.clinicId, t.patientId],
      foreignColumns: [patients.clinicId, patients.id],
    }).onDelete("restrict"),
    index("anamneses_patient_idx").on(
      t.clinicId,
      t.patientId,
      t.takenOn.desc(),
    ),
    check(
      "anamneses_answers_size_check",
      sql`pg_column_size(${t.answers}) <= 200000`,
    ),
  ],
);
