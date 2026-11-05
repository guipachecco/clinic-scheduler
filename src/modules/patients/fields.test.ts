import { describe, expect, it } from "vitest";

import {
  ageOn,
  formatBrPhoneInput,
  formatCpfInput,
  formatStoredCpf,
  formatStoredPhone,
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

describe("formatCpfInput", () => {
  it("formats progressively and keeps digits only", () => {
    expect(formatCpfInput("")).toBe("");
    expect(formatCpfInput("529")).toBe("529");
    expect(formatCpfInput("5299")).toBe("529.9");
    expect(formatCpfInput("529982")).toBe("529.982");
    expect(formatCpfInput("5299822")).toBe("529.982.2");
    expect(formatCpfInput("529982247")).toBe("529.982.247");
    expect(formatCpfInput("5299822472")).toBe("529.982.247-2");
    expect(formatCpfInput("52998224725")).toBe("529.982.247-25");
    expect(formatCpfInput("529.982.247-25")).toBe("529.982.247-25");
  });
  it("caps at 11 digits", () => {
    expect(formatCpfInput("5299822472599")).toBe("529.982.247-25");
  });
});

describe("formatBrPhoneInput", () => {
  it("formats progressively", () => {
    expect(formatBrPhoneInput("")).toBe("");
    expect(formatBrPhoneInput("4")).toBe("(4");
    expect(formatBrPhoneInput("48")).toBe("(48");
    expect(formatBrPhoneInput("489")).toBe("(48) 9");
    expect(formatBrPhoneInput("4833331234")).toBe("(48) 3333-1234");
    expect(formatBrPhoneInput("48999991234")).toBe("(48) 99999-1234");
  });
  it("drops a leading 55 only when more than 11 digits remain", () => {
    expect(formatBrPhoneInput("+5548999991234")).toBe("(48) 99999-1234");
    expect(formatBrPhoneInput("554833331234")).toBe("(48) 3333-1234");
    expect(formatBrPhoneInput("55")).toBe("(55");
    expect(formatBrPhoneInput("55999991234")).toBe("(55) 99999-1234");
  });
  it("keeps area code 55 when typing past 11 digits", () => {
    expect(formatBrPhoneInput("(55) 99999-12345")).toBe("(55) 99999-1234");
  });
  it("caps at 11 digits", () => {
    expect(formatBrPhoneInput("489999912349")).toBe("(48) 99999-1234");
  });
});

describe("formatStoredPhone / formatStoredCpf", () => {
  it("formats stored values", () => {
    expect(formatStoredPhone("+5548999991234")).toBe("(48) 99999-1234");
    expect(formatStoredPhone("+554833331234")).toBe("(48) 3333-1234");
    expect(formatStoredPhone(null)).toBe("");
    expect(formatStoredCpf("52998224725")).toBe("529.982.247-25");
    expect(formatStoredCpf(null)).toBe("");
  });
});

describe("patientFormSchema with masked input", () => {
  it("parses masked CPF and phones into stored values", () => {
    const result = patientFormSchema.parse({
      ...valid,
      cpf: "529.982.247-25",
      phone: "(48) 99999-1234",
      landlinePhone: "(48) 3333-1234",
    });
    expect(result.cpf).toBe("52998224725");
    expect(result.phone).toBe("+5548999991234");
    expect(result.landlinePhone).toBe("+554833331234");
  });
});
