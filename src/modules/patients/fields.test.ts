import { describe, expect, it } from "vitest";

import {
  ageOn,
  isMinor,
  normalizeBrPhone,
  normalizeName,
  parseCpf,
  patientFormSchema,
  todayInClinic,
} from "./fields";

// Every value here is fictitious.

const valid = {
  name: "Maria Fictícia",
  nickname: "",
  cpf: "",
  rg: "",
  phone: "(48) 99999-1234",
  landlinePhone: "",
  email: "",
  birthDate: "1990-05-10",
  gender: "",
  referralSource: "",
  referredBy: "",
  notes: "",
};

describe("parseCpf", () => {
  it("returns digits for a valid CPF", () => {
    expect(parseCpf("529.982.247-25")).toBe("52998224725");
  });
  it("rejects repeated digits, short and empty input", () => {
    expect(parseCpf("111.111.111-11")).toBeNull();
    expect(parseCpf("123")).toBeNull();
    expect(parseCpf("")).toBeNull();
  });
  it("rejects wrong check digits", () => {
    expect(parseCpf("529.982.247-24")).toBeNull();
  });
});

describe("normalizeBrPhone", () => {
  it("normalizes mobile numbers", () => {
    expect(normalizeBrPhone("(48) 99999-1234")).toBe("+5548999991234");
    expect(normalizeBrPhone("48999991234")).toBe("+5548999991234");
    expect(normalizeBrPhone("+55 48 99999-1234")).toBe("+5548999991234");
    expect(normalizeBrPhone("5548999991234")).toBe("+5548999991234");
  });
  it("normalizes landlines", () => {
    expect(normalizeBrPhone("(48) 3333-1234")).toBe("+554833331234");
  });
  it("rejects numbers without area code or with a bad one", () => {
    expect(normalizeBrPhone("99999-1234")).toBeNull();
    expect(normalizeBrPhone("(01) 3333-1234")).toBeNull();
    expect(normalizeBrPhone("")).toBeNull();
  });
});

describe("normalizeName", () => {
  it("lowercases, strips accents and collapses spaces", () => {
    expect(normalizeName("  Márcia   da  Silva ")).toBe("marcia da silva");
  });
});

describe("age helpers", () => {
  it("computes age and minority", () => {
    expect(ageOn("2008-10-30", "2026-10-30")).toBe(18);
    expect(ageOn("2008-10-31", "2026-10-30")).toBe(17);
    expect(isMinor("2008-10-30", "2026-10-30")).toBe(false);
    expect(isMinor("2008-10-31", "2026-10-30")).toBe(true);
  });
  it("gives the clinic date", () => {
    expect(todayInClinic(new Date("2026-10-30T01:00:00Z"))).toBe("2026-10-29");
    expect(todayInClinic(new Date("2026-10-30T15:00:00Z"))).toBe("2026-10-30");
  });
});

describe("patientFormSchema", () => {
  it("accepts a valid form and outputs nulls for absent fields", () => {
    const r = patientFormSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.phone).toBe("+5548999991234");
      expect(r.data.cpf).toBeNull();
      expect(r.data.email).toBeNull();
      expect(r.data.gender).toBeNull();
    }
  });
  it("rejects a future birth date", () => {
    expect(
      patientFormSchema.safeParse({ ...valid, birthDate: "2999-01-01" })
        .success,
    ).toBe(false);
  });
  it("rejects a birth date more than 120 years ago", () => {
    expect(
      patientFormSchema.safeParse({ ...valid, birthDate: "1850-01-01" })
        .success,
    ).toBe(false);
  });
  it("rejects a missing birth date", () => {
    expect(
      patientFormSchema.safeParse({ ...valid, birthDate: "" }).success,
    ).toBe(false);
  });
  it("rejects referredBy without referral", () => {
    expect(
      patientFormSchema.safeParse({ ...valid, referredBy: "Ana" }).success,
    ).toBe(false);
    expect(
      patientFormSchema.safeParse({
        ...valid,
        referredBy: "Ana",
        referralSource: "referral",
      }).success,
    ).toBe(true);
  });
  it("rejects notes over 1000 characters", () => {
    expect(
      patientFormSchema.safeParse({ ...valid, notes: "a".repeat(1001) })
        .success,
    ).toBe(false);
  });
  it("rejects an email over 254 characters", () => {
    const long = `${"a".repeat(250)}@example.com`;
    expect(patientFormSchema.safeParse({ ...valid, email: long }).success).toBe(
      false,
    );
  });
  it("rejects invalid cpf, phone and email", () => {
    expect(patientFormSchema.safeParse({ ...valid, cpf: "123" }).success).toBe(
      false,
    );
    expect(patientFormSchema.safeParse({ ...valid, phone: "" }).success).toBe(
      false,
    );
    expect(patientFormSchema.safeParse({ ...valid, email: "x" }).success).toBe(
      false,
    );
  });
});
