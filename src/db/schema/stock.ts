import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { appointments, clinics, products } from "./clinic";
import { createdAt } from "./columns";
import { saleItems } from "./finance";

// entry: stock came in. usage: used in an appointment. handover: given to the
// patient as a sold product. reversal: undoes one of the others.
export const stockMovementKind = pgEnum("stock_movement_kind", [
  "entry",
  "usage",
  "handover",
  "reversal",
]);

// The stock history of a product. products.stock_quantity is the sum of its
// movements. Nothing is updated or deleted (the panel has SELECT and INSERT
// only, migration 0029): a mistake is undone by a reversal, at most one per
// movement. The database checks the sign and the links of each kind; that a
// reversal has the opposite sign of the original, copies its links and is
// never itself reversed is checked by the app.
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    productId: uuid("product_id").notNull(),
    kind: stockMovementKind("kind").notNull(),
    // Signed: positive comes in, negative goes out.
    quantity: integer("quantity").notNull(),
    appointmentId: uuid("appointment_id"),
    saleItemId: uuid("sale_item_id"),
    reversesId: uuid("reverses_id"),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("stock_movements_clinic_id_id_unique").on(t.clinicId, t.id),
    unique("stock_movements_reverses_unique").on(t.reversesId),
    foreignKey({
      name: "stock_movements_product_fk",
      columns: [t.clinicId, t.productId],
      foreignColumns: [products.clinicId, products.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "stock_movements_appointment_fk",
      columns: [t.clinicId, t.appointmentId],
      foreignColumns: [appointments.clinicId, appointments.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "stock_movements_sale_item_fk",
      columns: [t.clinicId, t.saleItemId],
      foreignColumns: [saleItems.clinicId, saleItems.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "stock_movements_reverses_fk",
      columns: [t.clinicId, t.reversesId],
      foreignColumns: [t.clinicId, t.id],
    }).onDelete("restrict"),
    index("stock_movements_product_idx").on(
      t.clinicId,
      t.productId,
      t.createdAt.desc(),
    ),
    index("stock_movements_appointment_idx").on(t.appointmentId),
    index("stock_movements_sale_item_idx").on(t.saleItemId),
    check(
      "stock_movements_quantity_check",
      sql`(${t.kind} = 'entry' and ${t.quantity} > 0)
        or (${t.kind} in ('usage', 'handover') and ${t.quantity} < 0)
        or (${t.kind} = 'reversal' and ${t.quantity} <> 0)`,
    ),
    check(
      "stock_movements_links_check",
      sql`(${t.kind} = 'usage' and ${t.appointmentId} is not null)
        or (${t.kind} = 'handover' and ${t.saleItemId} is not null and ${t.appointmentId} is null)
        or (${t.kind} = 'entry' and ${t.appointmentId} is null and ${t.saleItemId} is null)
        or ${t.kind} = 'reversal'`,
    ),
    check(
      "stock_movements_reverses_check",
      sql`(${t.kind} = 'reversal') = (${t.reversesId} is not null)`,
    ),
    check(
      "stock_movements_note_check",
      sql`${t.note} is null or char_length(${t.note}) <= 200`,
    ),
  ],
);
