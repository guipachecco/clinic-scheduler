import * as z from "zod";
import type { AnamnesisTemplate, Question, Section } from "./template";

// Pure helpers for anamnesis answers. Imported by client components, so no
// database or server-only code here.

export type Answers = Record<string, string | string[]>;

export const TEXT_MAX = 200;
export const LONG_MAX = 5000;
// Upper bound for the serialized answers; enforced where answers are saved.
export const ANSWERS_MAX_BYTES = 200_000;

type Value = string | string[];

function questionSchema(q: Question): z.ZodType<Value> {
  switch (q.type) {
    case "text":
      return z.string().max(TEXT_MAX);
    case "long":
      return z.string().max(LONG_MAX);
    case "single": {
      const values = q.options.map((o) => o.value);
      // "" means "cleared"; it is dropped after validation.
      return z.string().refine((v) => v === "" || values.includes(v));
    }
    case "multi": {
      const values = q.options.map((o) => o.value);
      return z.array(z.string().refine((v) => values.includes(v)));
    }
  }
}

function isEmpty(v: Value): boolean {
  return Array.isArray(v) ? v.length === 0 : v === "";
}

// Rejects unknown ids, wrong types, options outside the list and text over
// the limit. Empty strings and empty arrays are dropped from the result.
export function answersSchema(template: AnamnesisTemplate): z.ZodType<Answers> {
  const shape: Record<string, z.ZodType<Value | undefined>> = {};
  for (const section of template.sections) {
    for (const q of section.questions) {
      shape[q.id] = questionSchema(q).optional();
    }
  }
  return z.strictObject(shape).transform((obj): Answers => {
    const out: Answers = {};
    for (const [id, v] of Object.entries(obj)) {
      if (v !== undefined && !isEmpty(v)) out[id] = v;
    }
    return out;
  });
}

// Keeps only the answers whose id exists in `to` with the same type, and
// only from sections of `to` that are marked to be copied. Choice values that
// `to` no longer offers are dropped.
export function copyAnswers(
  from: Answers,
  fromTemplate: AnamnesisTemplate,
  to: AnamnesisTemplate,
): Answers {
  const target = new Map<string, Question>();
  for (const section of to.sections) {
    if (!section.copy) continue;
    for (const q of section.questions) target.set(q.id, q);
  }
  const source = new Map<string, Question>();
  for (const section of fromTemplate.sections) {
    for (const q of section.questions) source.set(q.id, q);
  }
  const out: Answers = {};
  for (const [id, value] of Object.entries(from)) {
    const t = target.get(id);
    const s = source.get(id);
    if (!t || !s || t.type !== s.type) continue;
    if (t.type === "single" || t.type === "multi") {
      // Options may disappear between versions: keep only the ones left.
      const offered = new Set(t.options.map((o) => o.value));
      const kept = (Array.isArray(value) ? value : [value]).filter((v) =>
        offered.has(v),
      );
      if (kept.length === 0) continue;
      out[id] = Array.isArray(value) ? kept : kept[0]!;
    } else {
      out[id] = value;
    }
  }
  return out;
}

function answerText(q: Question, value: Value): string {
  const values = Array.isArray(value) ? value : [value];
  if (q.type === "single" || q.type === "multi") {
    return values
      .map((v) => q.options.find((o) => o.value === v)?.label ?? v)
      .join(", ");
  }
  return values.join(", ");
}

// Only answered questions, and only sections that have at least one.
export function answeredSections(
  template: AnamnesisTemplate,
  answers: Answers,
): { section: Section; items: { question: Question; text: string }[] }[] {
  const result: {
    section: Section;
    items: { question: Question; text: string }[];
  }[] = [];
  for (const section of template.sections) {
    const items: { question: Question; text: string }[] = [];
    for (const question of section.questions) {
      const value = answers[question.id];
      if (value === undefined || isEmpty(value)) continue;
      const text = answerText(question, value);
      if (text.trim() === "") continue;
      items.push({ question, text });
    }
    if (items.length > 0) result.push({ section, items });
  }
  return result;
}
