// Fictitious account created by e2e/global-setup.ts in the e2e test database.
export const TEST_ADMIN = {
  role: "admin" as const,
  clinicSlug: "grais",
  email: "admin@example.test",
  name: "Administradora de Teste",
  password: "senha-de-teste-e2e-bem-longa",
};

// Second account, used by the patient suite so it does not depend on the order
// of the other specs. It sets up its own 2FA (see e2e/helpers.ts).
export const TEST_ADMIN_PATIENTS = {
  role: "admin" as const,
  clinicSlug: "grais",
  email: "pacientes@example.test",
  name: "Administradora de Pacientes",
  password: "senha-de-teste-pacientes-bem-longa",
};

// Third account, used by the services suite.
export const TEST_ADMIN_SERVICES = {
  role: "admin" as const,
  clinicSlug: "grais",
  email: "servicos@example.test",
  name: "Administradora de Serviços",
  password: "senha-de-teste-servicos-bem-longa",
};

// Fourth account, used by the schedule suite (business hours and blocks).
export const TEST_ADMIN_SCHEDULE = {
  role: "admin" as const,
  clinicSlug: "grais",
  email: "expediente@example.test",
  name: "Administradora de Expediente",
  password: "senha-de-teste-expediente-bem-longa",
};

// Fifth account, used by the agenda suite.
export const TEST_ADMIN_AGENDA = {
  role: "admin" as const,
  clinicSlug: "grais",
  email: "agenda@example.test",
  name: "Administradora de Agenda",
  password: "senha-de-teste-agenda-bem-longa",
};

// Sixth account, used by the financial suite.
export const TEST_ADMIN_FINANCE = {
  role: "admin" as const,
  clinicSlug: "grais",
  email: "financeiro@example.test",
  name: "Administradora do Financeiro",
  password: "senha-de-teste-financeiro-bem-longa",
};

// Root account: sees every clinic and picks one in /admin/clinicas.
export const TEST_ROOT = {
  role: "root" as const,
  email: "root@example.test",
  name: "Root de Teste",
  password: "senha-de-teste-root-bem-longa",
};

// Root account of the branding suite (each root account sets up its own 2FA).
export const TEST_ROOT_BRANDING = {
  role: "root" as const,
  email: "identidade@example.test",
  name: "Root de Identidade",
  password: "senha-de-teste-identidade-bem-longa",
};

// Owner of the client-area suite's clinic (see CLIENT_AREA in
// e2e/client-area-fixtures.ts): checks the online booking in the agenda.
export const TEST_ADMIN_CLIENT_AREA = {
  role: "admin" as const,
  clinicSlug: "clinica-cliente-a",
  email: "dona-area-cliente@example.test",
  name: "Dona da Área da Cliente",
  password: "senha-de-teste-area-cliente-bem-longa",
};

// Owner of clinic B of the client-area fixtures: answers the provisional
// records of e2e/patient-links.spec.ts.
export const TEST_ADMIN_PATIENT_LINKS = {
  role: "admin" as const,
  clinicSlug: "clinica-cliente-b",
  email: "dona-fichas-online@example.test",
  name: "Dona das Fichas Online",
  password: "senha-de-teste-fichas-online-bem-longa",
};
