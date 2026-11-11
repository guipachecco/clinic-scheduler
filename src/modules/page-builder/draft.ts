import * as z from "zod";

import type { ClinicTheme } from "@/db/schema/clinic";
import { HEX_COLOR } from "@/modules/branding/derive";
import {
  BUSINESS_TYPES,
  type BusinessType,
} from "@/modules/business-type/vocabulary";
import { MAX_CLINIC_PHOTOS } from "@/modules/clinic-page/limits";
import { BUTTON_FILLS, BUTTON_SHAPES } from "@/modules/page-style/buttons";
import { FONTS, type FontId } from "@/modules/page-style/fonts";

// The unpublished draft of a clinic's page (clinics.page_draft), shared by the
// server and the panel's wizard. A field the draft leaves out keeps the
// published value; null removes it.

export const STEP_IDS = [
  "tipo",
  "logo",
  "perfil",
  "capa",
  "cor",
  "botoes",
  "fonte",
  "texto",
  "galeria",
  "publicar",
] as const;

export type StepId = (typeof STEP_IDS)[number];

const mediaId = z.uuid("Imagem inválida.");

const nullableText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} muito longo (máximo de ${max} caracteres).`)
    .transform((value) => value || null)
    .nullable();

const themeShape = {
  primaryColor: z.string().regex(HEX_COLOR, "Cor inválida.").optional(),
  buttonShape: z.enum(BUTTON_SHAPES).optional(),
  buttonFill: z.enum(BUTTON_FILLS).optional(),
  fontId: z
    .enum(FONTS.map((font) => font.id) as [FontId, ...FontId[]])
    .optional(),
};

const draftShape = {
  businessType: z.enum(BUSINESS_TYPES).optional(),
  logoMediaId: mediaId.nullable().optional(),
  ownerPhotoMediaId: mediaId.nullable().optional(),
  coverMediaId: mediaId.nullable().optional(),
  theme: z.object(themeShape).optional(),
  headline: nullableText(120, "Frase de apresentação").optional(),
  about: nullableText(2000, "Texto sobre o negócio").optional(),
  gallery: z
    .array(mediaId)
    .max(
      MAX_CLINIC_PHOTOS,
      `A página pode ter no máximo ${MAX_CLINIC_PHOTOS} fotos.`,
    )
    .refine((ids) => new Set(ids).size === ids.length, "Foto repetida.")
    .optional(),
};

export const pageDraftSchema = z.object(draftShape);

export type PageDraft = z.infer<typeof pageDraftSchema>;

// What the page shows today, in the draft's terms.
export type PublishedPage = {
  businessType: BusinessType;
  logoMediaId: string | null;
  ownerPhotoMediaId: string | null;
  coverMediaId: string | null;
  theme: ClinicTheme;
  headline: string | null;
  about: string | null;
  gallery: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Reads a stored draft. Never throws: each invalid field is dropped on its
// own, so one bad value does not lose the rest of the owner's work.
export function parseDraft(raw: unknown): PageDraft {
  if (!isRecord(raw)) return {};
  const draft: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(draftShape)) {
    if (!(key in raw) || raw[key] === undefined) continue;
    if (key === "theme") {
      if (!isRecord(raw.theme)) continue;
      const theme: Record<string, unknown> = {};
      for (const [field, fieldSchema] of Object.entries(themeShape)) {
        const parsed = fieldSchema.safeParse(raw.theme[field]);
        if (parsed.success && parsed.data !== undefined) {
          theme[field] = parsed.data;
        }
      }
      draft.theme = theme;
      continue;
    }
    const parsed = schema.safeParse(raw[key]);
    if (parsed.success) draft[key] = parsed.data;
  }
  return draft as PageDraft;
}

function definedEntries<T extends object>(value: T | undefined): Partial<T> {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

function pick<T>(draftValue: T | undefined, publishedValue: T): T {
  return draftValue === undefined ? publishedValue : draftValue;
}

// The page as it will look once the draft is published.
export function mergeDraft(
  published: PublishedPage,
  draft: PageDraft,
): PublishedPage {
  return {
    businessType: pick(draft.businessType, published.businessType),
    logoMediaId: pick(draft.logoMediaId, published.logoMediaId),
    ownerPhotoMediaId: pick(
      draft.ownerPhotoMediaId,
      published.ownerPhotoMediaId,
    ),
    coverMediaId: pick(draft.coverMediaId, published.coverMediaId),
    theme: { ...published.theme, ...definedEntries(draft.theme) },
    headline: pick(draft.headline, published.headline),
    about: pick(draft.about, published.about),
    gallery: pick(draft.gallery, published.gallery),
  };
}

// A change saved on top of the current draft: the patch's keys win (null
// included) and the theme is merged field by field.
export function mergePatch(draft: PageDraft, patch: PageDraft): PageDraft {
  const next: PageDraft = { ...draft, ...definedEntries(patch) };
  if (patch.theme !== undefined) {
    next.theme = { ...draft.theme, ...definedEntries(patch.theme) };
  }
  return next;
}

// Every image the draft points at, once each.
export function draftMediaIds(draft: PageDraft): string[] {
  const ids = [
    draft.logoMediaId,
    draft.ownerPhotoMediaId,
    draft.coverMediaId,
    ...(draft.gallery ?? []),
  ].filter((id): id is string => typeof id === "string");
  return [...new Set(ids)];
}
