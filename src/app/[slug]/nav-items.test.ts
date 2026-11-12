import { describe, expect, it } from "vitest";

import { clientNavItems, isActiveNavItem } from "./nav-items";

describe("clientNavItems", () => {
  it("lists the four items of the clinic link", () => {
    expect(
      clientNavItems("clinica", false).map((item) => [item.label, item.href]),
    ).toEqual([
      ["Início", "/clinica"],
      ["Agendar", "/clinica/marcar"],
      ["Meus horários", "/clinica/meus-horarios"],
      ["Perfil", "/clinica/entrar"],
    ]);
  });

  it("sends Perfil to the profile once she is signed in", () => {
    expect(clientNavItems("clinica", true)[3]?.href).toBe("/clinica/perfil");
  });
});

describe("isActiveNavItem", () => {
  const [home, book] = clientNavItems("clinica", false);

  it("marks the home only on its exact path", () => {
    expect(isActiveNavItem(home!, "/clinica")).toBe(true);
    expect(isActiveNavItem(home!, "/clinica/marcar")).toBe(false);
  });

  it("marks an item on its path and below it", () => {
    expect(isActiveNavItem(book!, "/clinica/marcar")).toBe(true);
    expect(isActiveNavItem(book!, "/clinica/marcar/x")).toBe(true);
    expect(isActiveNavItem(book!, "/clinica/marcarx")).toBe(false);
    expect(isActiveNavItem(book!, "/clinica")).toBe(false);
  });
});
