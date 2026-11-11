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

// Owner used by the clinic page suite ("Minha página").
export const TEST_ADMIN_CLINIC_PAGE = {
  role: "admin" as const,
  clinicSlug: "grais",
  email: "pagina@example.test",
  name: "Administradora da Página",
  password: "senha-de-teste-pagina-bem-longa",
};

// Owner used by the phone panel shell suite (bottom bar and "Mais" sheet).
export const TEST_ADMIN_PANEL_MOBILE = {
  role: "admin" as const,
  clinicSlug: "grais",
  email: "painel-celular@example.test",
  name: "Administradora do Painel Celular",
  password: "senha-de-teste-painel-celular-bem-longa",
};

// Owner of the clinic dedicated to the panel home suite (e2e/panel-home.spec.ts),
// so today's numbers are not disturbed by the other suites' appointments.
export const PANEL_HOME_CLINIC_SLUG = "clinica-painel-inicio";
export const TEST_ADMIN_PANEL_HOME = {
  role: "admin" as const,
  clinicSlug: PANEL_HOME_CLINIC_SLUG,
  email: "painel-inicio@example.test",
  name: "Karol Teste do Início",
  password: "senha-de-teste-painel-inicio-bem-longa",
};

// Owner used by the phone agenda suite. It shares the panel home clinic (it
// has its own account so each suite sets up its own 2FA) and only touches
// dates far in the future.
export const TEST_ADMIN_AGENDA_PHONE = {
  role: "admin" as const,
  clinicSlug: PANEL_HOME_CLINIC_SLUG,
  email: "agenda-celular@example.test",
  name: "Dona da Agenda no Celular",
  password: "senha-de-teste-agenda-celular-bem-longa",
};

// Owner used by the anamnesis suite (e2e/anamnesis.spec.ts).
export const TEST_ADMIN_ANAMNESIS = {
  role: "admin" as const,
  clinicSlug: "grais",
  email: "anamnese@example.test",
  name: "Administradora da Anamnese",
  password: "senha-de-teste-anamnese-bem-longa",
};

// Root account of the anamnesis suite: opens a clinic without anamnesis.
export const TEST_ROOT_ANAMNESIS = {
  role: "root" as const,
  email: "root-anamnese@example.test",
  name: "Root da Anamnese",
  password: "senha-de-teste-root-anamnese-bem-longa",
};

// Owner of the clinic dedicated to the page builder suite
// (e2e/page-builder.spec.ts): a barbershop that publishes its page through
// the panel wizard.
export const PAGE_BUILDER_CLINIC_SLUG = "barbearia-montar-pagina";
export const TEST_ADMIN_PAGE_BUILDER = {
  role: "admin" as const,
  clinicSlug: PAGE_BUILDER_CLINIC_SLUG,
  email: "montar-pagina@example.test",
  name: "Dono da Barbearia",
  password: "senha-de-teste-montar-pagina-bem-longa",
};
