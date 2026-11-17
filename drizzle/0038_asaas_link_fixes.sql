-- "É a mesma" (src/modules/patients/links.ts, confirmLink) moves the
-- provisional record's rows to the existing patient and then deletes it. Its
-- Pix deposits move with it; its Asaas customer moves too, or is deleted when
-- the existing patient already has one (one per patient).
GRANT UPDATE (patient_id) ON asaas_deposits TO app_panel;--> statement-breakpoint
GRANT DELETE ON asaas_customers TO app_panel;--> statement-breakpoint

-- Same search_path as the other SECURITY DEFINER functions (0013).
ALTER FUNCTION asaas_deposit_clinic(uuid) SET search_path = public, pg_temp;--> statement-breakpoint
ALTER FUNCTION asaas_deposit_active(uuid) SET search_path = public, pg_temp;
