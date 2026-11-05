-- "É a mesma" (confirmLink, src/modules/patients/links.ts) merges a client's
-- provisional record into the existing patient, and the history of the
-- provisional record moves with it: audit_logs.entity_id is repointed at the
-- existing record. The panel may change that column only; the rest of the
-- history stays append-only (tests/integration/patient-links.test.ts checks
-- it). The audit_logs_panel policy (0011) is FOR ALL, so the clinic filter
-- already applies to UPDATE.
GRANT UPDATE (entity_id) ON audit_logs TO app_panel;
