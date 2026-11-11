import {
  type BusinessType,
  STARTER_STYLE,
} from "@/modules/business-type/vocabulary";
import {
  type PageDraft,
  type PublishedPage,
  STEP_IDS,
  type StepId,
} from "@/modules/page-builder/draft";

// Pure pieces of the page wizard: step names and questions, the starting
// style a business type suggests and the list of what will change on publish.

export const STEP_INFO: Record<StepId, { name: string; question: string }> = {
  tipo: { name: "Tipo de negócio", question: "Qual é o seu tipo de negócio?" },
  logo: { name: "Logo", question: "Qual é o logo do seu negócio?" },
  perfil: { name: "Foto de perfil", question: "Qual foto vai no seu perfil?" },
  capa: { name: "Foto de capa", question: "Qual foto vai no topo da página?" },
  cor: { name: "Cor", question: "Qual a cor do seu negócio?" },
  botoes: { name: "Botões", question: "Como ficam os seus botões?" },
  fonte: { name: "Fonte", question: "Qual letra combina com você?" },
  texto: {
    name: "Apresentação",
    question: "Como você apresenta o seu negócio?",
  },
  galeria: { name: "Galeria", question: "Quais fotos mostram o seu trabalho?" },
  publicar: { name: "Publicar", question: "Tudo pronto para publicar?" },
};

// `?passo=` read from the URL; anything unknown opens the first step.
export function stepFromParam(value: string | string[] | undefined): StepId {
  return STEP_IDS.find((id) => id === value) ?? STEP_IDS[0];
}

export function stepHref(step: StepId): string {
  return `/admin/pagina/montar?passo=${step}`;
}

const STARTER_FIELDS = ["primaryColor", "fontId", "buttonShape"] as const;

// The patch of the business type step: the type, plus the suggested style
// for each look field that neither the page nor the draft has chosen yet.
export function businessTypePatch(
  type: BusinessType,
  published: PublishedPage,
  draft: PageDraft,
): PageDraft {
  const starter = STARTER_STYLE[type];
  const theme: NonNullable<PageDraft["theme"]> = {};
  for (const field of STARTER_FIELDS) {
    const chosen = published.theme[field] ?? draft.theme?.[field];
    if (chosen === undefined) {
      Object.assign(theme, { [field]: starter[field] });
    }
  }
  return Object.keys(theme).length > 0
    ? { businessType: type, theme }
    : { businessType: type };
}

const CHANGE_LABELS: Record<keyof PublishedPage, string> = {
  businessType: "Tipo de negócio",
  logoMediaId: "Logo",
  ownerPhotoMediaId: "Foto de perfil",
  coverMediaId: "Foto de capa",
  theme: "Cor, botões ou fonte",
  headline: "Frase de apresentação",
  about: "Sobre",
  gallery: "Galeria",
};

// What publishing would change, in the owner's words.
export function changedLabels(
  published: PublishedPage,
  next: PublishedPage,
): string[] {
  return (Object.keys(CHANGE_LABELS) as (keyof PublishedPage)[])
    .filter(
      (field) =>
        JSON.stringify(published[field]) !== JSON.stringify(next[field]),
    )
    .map((field) => CHANGE_LABELS[field]);
}

// "0A7D5A", "#0a7d5a " and the like become "#0a7d5a"; other text is kept
// as typed, for the server to refuse with a message.
export function normalizeColor(text: string): string {
  const value = text.trim().toLowerCase();
  return /^[0-9a-f]{6}$/.test(value) ? `#${value}` : value;
}

// The list with the item at `index` moved one place up (-1) or down (+1).
export function moveItem<T>(list: T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length)
    return list;
  const next = [...list];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
