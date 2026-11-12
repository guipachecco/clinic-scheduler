# Preços e "por dentro" na página da Zemana: plano de construção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Duas seções novas na página `/`, "Olha só como fica." (fotos reais do sistema em abas) e "Sem letra miúda." (planos Agenda e Completo com preço de lançamento), cada plano levando ao WhatsApp com o nome do plano.

**Architecture:** Os preços e a data da virada ficam num módulo puro (`src/app/landing/pricing.ts`), testado por unidade, que devolve o que mostrar para uma data. As seções são componentes de servidor no estilo da página (`Sticker`, `TornEdge`, `displayClass`, `RiseIn`); só as abas da galeria são um componente de cliente. As fotos são WebP em `public/landing/por-dentro/`.

**Tech Stack:** Next.js 16 (App Router, sem `cacheComponents`), React, Tailwind, `motion/react`, `next/image`, Vitest (`--project unit`), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-12-precos-na-pagina-design.md`

## Global Constraints

- Nenhuma profissão em cartões, adesivos ou textos novos (nada de "manicure", "clínica" como público, "estética" como público). Texto geral da seção: "Pra beleza, estética e saúde. Sem fidelidade, cancele quando quiser."
- Planos: **Agenda**, adesivo "Atende por horário", R$ 29,90 até 31/12/2026 e R$ 49,90 a partir de 01/01/2027. **Completo**, adesivo "Vende pacote ou parcela", R$ 99,00 e R$ 149,90.
- Agenda inclui: "Agenda e fichas das clientes", "Seu link de agendamento", "Página com avaliações e fidelidade". Completo inclui: "Tudo do Agenda", "Orçamento, pacotes e parcelas", "Caixa e valores a receber", "Anamnese e produtos".
- Adesivos: "1º mês grátis" (sempre) e "Preço de lançamento até 31/12: garanta esse preço" (só até a virada).
- A virada é 01/01/2027 00:00 em America/Sao_Paulo (`2027-01-01T03:00:00Z`), numa constante só, e precisa acontecer sem deploy.
- Botões dos planos: "Quero o Agenda" e "Quero o Completo", abrindo `https://wa.me/5547991037244` com "Oi! Quero o plano Agenda da Zemana." ou "Oi! Quero o plano Completo da Zemana.", com `target="_blank"` e `rel="noopener noreferrer"`. O `QUOTE_URL` atual não muda.
- Estilo da página: cores fixas `#2a0081`, `#f5c700`, `#ffd3f0`, `#b7e7fc`, borda de 3px roxa, sombra dura, cartões girados de 1 a 2 graus. Sem rolagem lateral em 360px.
- Fotos só com dados inventados. Nenhum nome, telefone ou e-mail real.
- Comentários de código em inglês e textos da interface em português, como no resto do projeto.

## Review Focus

- **Virada de data no fuso de Brasília:** às 23h59 de 31/12/2026 em São Paulo ainda é preço de lançamento, e à meia-noite já não é, mesmo com o servidor em UTC. Teste na Task 1.
- **Formato do preço:** "R$ 29,90" e "R$ 99,00" com vírgula e centavos, nunca "R$ 99" ou "29.9". Teste na Task 1.
- **Acentos na mensagem do WhatsApp:** o link precisa abrir com a mensagem certa, codificada. Teste na Task 1 (`decodeURIComponent`) e na Task 3 (`href` exato).
- **Celular de 360px:** cartões girados, sombras e adesivos não podem criar rolagem lateral. O teste existente "no horizontal scroll at 360 px" cobre a página inteira. Rode-o na Task 3 e na Task 4.
- **Sem JavaScript ou com movimento reduzido:** os preços e os botões continuam visíveis, sem `opacity: 0`. Teste na Task 3.

---

### Task 1: Preços e links dos planos

**Files:**

- Create: `src/app/landing/pricing.ts`
- Create: `src/app/landing/pricing.test.ts`
- Modify: `src/app/landing/quote-link.ts`

**Interfaces:**

- Produces:
  - `whatsappUrl(message: string): string`, em `quote-link.ts`. `QUOTE_URL` passa a ser `whatsappUrl("Oi! Vi o site da Zemana e quero um orçamento para minha clínica.")`, com o mesmo valor de hoje.
  - `type PlanId = "agenda" | "completo"`
  - `LAUNCH_ENDS_AT: Date` = `new Date("2027-01-01T03:00:00Z")`
  - `formatBRL(cents: number): string` → `"R$ 29,90"`. Use `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })` e troque o espaço sem quebra por espaço comum, para os testes compararem texto simples.
  - `type ShownPlan = { id: PlanId; name: string; audience: string; description: string; includes: string[]; price: string; regularPrice: string | null; ctaLabel: string; ctaHref: string }`
  - `pricingFor(now: Date): { launch: boolean; plans: ShownPlan[] }`. `launch` é `now < LAUNCH_ENDS_AT`. Na promoção, `price` é o de lançamento e `regularPrice` é o de 2027. Depois, `price` é o de 2027 e `regularPrice` é `null`. Os planos vêm em ordem: Agenda, Completo.
  - Descrições: Agenda, "Pra quem quer as clientes marcando sozinhas e a semana organizada."; Completo, "Pra quem também faz orçamento, vende pacote de sessões ou parcela."

- [ ] **Step 1: Write the failing test** `src/app/landing/pricing.test.ts`

```ts
describe("pricingFor", () => {
  test("launch prices until 31/12/2026 23:59 in São Paulo", () => {
    const r = pricingFor(new Date("2027-01-01T02:59:00Z"));
    expect(r.launch).toBe(true);
    expect(r.plans.map((p) => [p.name, p.price, p.regularPrice])).toEqual([
      ["Agenda", "R$ 29,90", "R$ 49,90"],
      ["Completo", "R$ 99,00", "R$ 149,90"],
    ]);
  });
  test("regular prices from 01/01/2027 00:00 in São Paulo", () => {
    const r = pricingFor(new Date("2027-01-01T03:00:00Z"));
    expect(r.launch).toBe(false);
    expect(r.plans.map((p) => [p.price, p.regularPrice])).toEqual([
      ["R$ 49,90", null],
      ["R$ 149,90", null],
    ]);
  });
  test("each plan opens WhatsApp naming the plan", () => {
    const [agenda, completo] = pricingFor(new Date("2026-11-12")).plans;
    expect(agenda!.ctaLabel).toBe("Quero o Agenda");
    expect(decodeURIComponent(completo!.ctaHref)).toBe(
      "https://wa.me/5547991037244?text=Oi! Quero o plano Completo da Zemana.",
    );
  });
  test("audiences name a way of working, not a profession", () => {
    const text = JSON.stringify(
      pricingFor(new Date("2026-11-12")),
    ).toLowerCase();
    for (const word of ["manicure", "clínica", "massoterap", "acupunt"]) {
      expect(text).not.toContain(word);
    }
  });
});
test("formatBRL", () => {
  expect(formatBRL(2990)).toBe("R$ 29,90");
  expect(formatBRL(9900)).toBe("R$ 99,00");
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test:unit src/app/landing/pricing.test.ts`
Expected: FAIL, porque o módulo `./pricing` não existe.

- [ ] **Step 3: Implement `whatsappUrl` in `quote-link.ts` and `pricing.ts` with the interfaces above**

Os valores ficam em centavos (2990, 4990, 9900, 14990).

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `pnpm test:unit src/app/landing/pricing.test.ts`
Expected: PASS, com 5 testes.

- [ ] **Step 5: Commit**

```bash
git add src/app/landing/pricing.ts src/app/landing/pricing.test.ts src/app/landing/quote-link.ts
git commit -m "feat(landing): preços dos planos e virada de 2027"
```

### Task 2: Fotos do sistema com dados inventados

**Files:**

- Create: `public/landing/por-dentro/agenda-desktop.webp`, `agenda-celular.webp`, `orcamento-desktop.webp`, `pagina-desktop.webp`, `pagina-celular.webp`, `inicio-celular.webp`

Esta task é manual: não tem teste, e o resultado são as imagens.

- [ ] **Step 1: Montar uma clínica de exemplo no ambiente local** (`docker compose up -d`, `pnpm db:migrate`, `pnpm dev`, `pnpm admin create` com endereço `espaco-exemplo`). Pelo painel, crie 4 a 6 serviços e 6 pacientes com nomes e telefones fictícios (padrão `(11) 90000-00xx`), uma semana de atendimentos, um orçamento aprovado em pacote parcelado e a página da clínica preenchida.
- [ ] **Step 2: Capturar as telas.** Computador em 1280×800 (Agenda na semana, venda do orçamento, página pública da clínica) e celular em 390×844 (agenda do dia, início do painel, página pública). Confira cada captura em busca de dados reais antes de salvar.
- [ ] **Step 3: Converter para WebP** com no máximo 1600px de largura e qualidade 80 (o `sharp` já vem com o Next), cada arquivo com menos de 200 KB.

Run: `ls -l public/landing/por-dentro`
Expected: os 6 arquivos, cada um com menos de 200 KB.

- [ ] **Step 4: Commit**

```bash
git add public/landing/por-dentro
git commit -m "feat(landing): fotos do sistema com dados de exemplo"
```

### Task 3: Seção "Sem letra miúda." (preços)

**Files:**

- Create: `src/app/landing/pricing-section.tsx`
- Modify: `src/app/page.tsx` (entre `<Features />` e `<FinalCta />`)
- Test: `e2e/landing.spec.ts`

**Interfaces:**

- Consumes: `pricingFor`, `ShownPlan` (Task 1); `Sticker`, `TornEdge`, `displayClass` (`./ui`); `RiseIn` (`./motion`).
- Produces: `PricingSection(): JSX.Element`, uma seção com `aria-labelledby="landing-pricing"`, fundo `#b7e7fc`, cada cartão com `data-testid="plan-card"`.

- [ ] **Step 1: Write the failing e2e tests** em `e2e/landing.spec.ts`

```ts
test("pricing shows both plans with launch price and plan WhatsApp", async ({
  page,
}) => {
  await page.goto("/");
  const section = page.getByRole("region", { name: "Sem letra miúda." });
  await expect(section.getByTestId("plan-card")).toHaveCount(2);
  await expect(section.getByText("R$ 29,90", { exact: true })).toBeVisible();
  await expect(section.getByText("R$ 99,00", { exact: true })).toBeVisible();
  await expect(section.getByText("R$ 149,90", { exact: true })).toBeVisible();
  await expect(section.getByText("1º mês grátis")).toBeVisible();
  await expect(section.getByText(/garanta esse preço/i)).toBeVisible();
  const cta = section.getByRole("link", { name: "Quero o Completo" });
  await expect(cta).toHaveAttribute(
    "href",
    `https://wa.me/5547991037244?text=${encodeURIComponent("Oi! Quero o plano Completo da Zemana.")}`,
  );
  await expect(cta).toHaveAttribute("target", "_blank");
});
```

Na lista de `"feature cards show without JavaScript"` e de `"reduced motion shows the page static and readable"`, acrescente: os dois `plan-card` com `opacity` 1 e "R$ 29,90" visível. Esses testes só valem até 31/12/2026. Por isso, cada um fica atrás de `test.skip(Date.now() >= Date.parse("2027-01-01T03:00:00Z"), "launch over")`. O comportamento depois da virada já está coberto pela Task 1.

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm test:e2e e2e/landing.spec.ts`
Expected: o teste de preços falha porque não encontra a região "Sem letra miúda."

- [ ] **Step 3: Implement `PricingSection`** seguindo a maquete escolhida (B, em `.superpowers/brainstorm/*/content/planos-por-necessidade-v3.html`):
  - Adesivo "Preços", título `<h2 id="landing-pricing">Sem letra miúda.</h2>` com `displayClass`.
  - Cartão Agenda amarelo, girado `-rotate-[1.5deg]`. Cartão Completo roxo, com o nome em amarelo, girado `rotate-[1.5deg]` e sombra `#f5c700`.
  - `regularPrice`, quando existir, aparece em `<s>` com o texto "R$ 49,90/mês".
  - Os adesivos ficam abaixo dos cartões.

  Chame `pricingFor(new Date())` dentro do componente. Em `src/app/page.tsx`, acrescente `export const revalidate = 3600`, para que a virada aconteça em até 1 hora, mesmo se a página for gerada no build.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `pnpm test:e2e e2e/landing.spec.ts`
Expected: tudo passa, inclusive "no horizontal scroll at 360 px".

- [ ] **Step 5: Commit**

```bash
git add src/app/landing/pricing-section.tsx src/app/page.tsx e2e/landing.spec.ts
git commit -m "feat(landing): seção de preços com Agenda e Completo"
```

### Task 4: Seção "Olha só como fica." (fotos em abas)

**Files:**

- Create: `src/app/landing/inside-section.tsx` (servidor)
- Create: `src/app/landing/inside-tabs.tsx` (`"use client"`)
- Modify: `src/app/page.tsx` (antes de `<PricingSection />`)
- Test: `e2e/landing.spec.ts`

**Interfaces:**

- Consumes: as imagens da Task 2; `Sticker`, `displayClass`, `TornEdge`.
- Produces: `InsideSection(): JSX.Element`, uma seção com `aria-labelledby="landing-inside"` e fundo `#ffd3f0`. `InsideTabs({ tabs }: { tabs: InsideTab[] })`, com `type InsideTab = { id: string; label: string; caption: string; desktop?: { src: string; alt: string }; phone?: { src: string; alt: string } }`.

As abas, na ordem: "Agenda" (agenda-desktop e agenda-celular), "Orçamento" (orcamento-desktop), "Sua página" (pagina-desktop e pagina-celular), "No celular" (inicio-celular). As legendas são curtas e no tom da página. Exemplo: "Semana inteira numa tela só".

- [ ] **Step 1: Write the failing e2e test**

```ts
test("inside tabs switch the screenshot", async ({ page }) => {
  await page.goto("/");
  const section = page.getByRole("region", { name: "Olha só como fica." });
  const tabs = section.getByRole("tab");
  await expect(tabs).toHaveText([
    "Agenda",
    "Orçamento",
    "Sua página",
    "No celular",
  ]);
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(section.getByRole("tabpanel")).toBeVisible();
  await expect(
    section.getByRole("tabpanel").getByRole("img").first(),
  ).toHaveAttribute("alt", /.+/);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test:e2e e2e/landing.spec.ts -g "inside tabs"`
Expected: FAIL, porque a região não existe.

- [ ] **Step 3: Implement** seguindo o padrão WAI-ARIA de abas: `role="tablist"`, `role="tab"` com `aria-selected` e `aria-controls`, `role="tabpanel"`, setas esquerda e direita com volta ao início, Home e End, e foco que acompanha a aba.
  - Sem JavaScript, o HTML do servidor mostra a primeira aba.
  - As fotos usam `next/image` com `sizes`, dentro da moldura de navegador (barra rosa com três bolinhas, borda de 3px, sombra `8px 8px 0 #2a0081`, levemente girada) e da moldura de celular, como na maquete.
  - A aba ativa fica roxa e girada `-rotate-2`.

- [ ] **Step 4: Run the whole landing spec to make sure it passes**

Run: `pnpm test:e2e e2e/landing.spec.ts`
Expected: tudo passa, inclusive "no horizontal scroll at 360 px".

- [ ] **Step 5: Commit**

```bash
git add src/app/landing/inside-section.tsx src/app/landing/inside-tabs.tsx src/app/page.tsx e2e/landing.spec.ts
git commit -m "feat(landing): galeria do sistema em abas"
```

### Task 5: Textos que diziam "sem preço"

**Files:**

- Modify: `src/app/page.tsx` (`DESCRIPTION`)
- Modify: `src/app/landing/features.tsx` (comentário do topo: tirar "no prices")
- Modify: `public/llms.txt` (seção "Como contratar")
- Modify: `src/app/(zemana)/termos/page.tsx:70-71` e a data de versão no topo da página
- Test: `e2e/landing.spec.ts`, `e2e/seo.spec.ts`

- [ ] **Step 1: Update the texts**
  - `DESCRIPTION`: "Agendamento pelo link, agenda, fichas das clientes, financeiro e uma página com avaliações e fidelidade. Planos a partir de R$ 29,90 por mês, com o 1º mês grátis." Depois da virada, o "a partir de" fica desatualizado, porque o texto é fixo. Por isso, monte-o com `pricingFor(new Date()).plans[0].price`.
  - `llms.txt`, em "Como contratar": os dois planos com o que incluem, "1º mês grátis" e a contratação pelo WhatsApp. Sem preço de lançamento, porque o arquivo é estático e não vira sozinho. Cite os preços a partir de 2027 e diga que há preço de lançamento até 31/12/2026.
  - Termos: "Os preços dos planos estão na página principal da Zemana. A cobrança e as demais condições são combinadas diretamente com a Zemana." Atualize a data de versão.

- [ ] **Step 2: Run the affected tests and checks**

Run: `pnpm test:e2e e2e/landing.spec.ts e2e/seo.spec.ts`, depois `pnpm lint`, `pnpm typecheck` e `pnpm format:check`
Expected: tudo passa. Se algum teste de SEO comparar a descrição exata, ajuste o valor esperado.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx src/app/landing/features.tsx public/llms.txt "src/app/(zemana)/termos/page.tsx" e2e
git commit -m "docs(landing): descrição, llms.txt e termos citam os planos"
```

### Task 6: Conferência final

- [ ] **Step 1:** Rode `pnpm build` e confira, na saída, que `/` compila. Anote se ela saiu estática (○) ou dinâmica (ƒ). Nos dois casos, a virada funciona: pelo `revalidate` ou pela renderização a cada pedido.
- [ ] **Step 2:** Abra `/` em 360px e em 1280px, com movimento normal e reduzido, e compare com a maquete B. Rode `pnpm test:unit` e `pnpm test:e2e e2e/landing.spec.ts`.
- [ ] **Step 3:** Atualize o README (o parágrafo "O que já funciona", que fala da página da Zemana) com uma frase sobre os planos e a galeria. Faça o commit.
