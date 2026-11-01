// Fictitious account created by e2e/global-setup.ts in the e2e test database.
export const TEST_ADMIN = {
  email: "admin@example.test",
  name: "Administradora de Teste",
  password: "senha-de-teste-e2e-bem-longa",
};

// Second account, used by the patient suite so it does not depend on the order
// of the other specs. It sets up its own 2FA (see e2e/helpers.ts).
export const TEST_ADMIN_PATIENTS = {
  email: "pacientes@example.test",
  name: "Administradora de Pacientes",
  password: "senha-de-teste-pacientes-bem-longa",
};

// Third account, used by the services suite.
export const TEST_ADMIN_SERVICES = {
  email: "servicos@example.test",
  name: "Administradora de Serviços",
  password: "senha-de-teste-servicos-bem-longa",
};
