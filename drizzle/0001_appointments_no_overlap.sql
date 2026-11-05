-- Rejects two active appointments (requested or confirmed) whose occupied
-- ranges overlap, even when the requests arrive at the same moment.
-- '[)' lets an appointment start exactly when the previous one ends.
-- Violations raise SQLSTATE 23P01 (see src/db/errors.ts).
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    tstzrange("occupied_from", "occupied_until", '[)') WITH &&
  )
  WHERE ("status" IN ('requested', 'confirmed'));
