-- The single settings row (id = 1). Site content stays empty until the clinic
-- fills it in, and online booking starts disabled.
INSERT INTO "clinic_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
