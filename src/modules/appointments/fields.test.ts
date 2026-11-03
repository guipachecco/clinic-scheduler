import { describe, expect, it } from "vitest";

import {
  APPOINTMENT_STATUSES,
  appointmentFormSchema,
  CANCELLATION_REASON_LABELS,
  canTransition,
  isEditableStatus,
  rescheduleSchema,
  type Status,
  STATUS_LABELS,
  statusChangeSchema,
} from "./fields";

const START = new Date("2026-11-10T13:00:00Z");
const BEFORE = new Date("2026-11-10T12:59:00Z");
const AFTER = new Date("2026-11-10T13:00:00Z");

describe("canTransition", () => {
  // [from, to, allowed before start, allowed at/after start]
  const matrix: [Status, Status, boolean, boolean][] = [
    ["requested", "requested", false, false],
    ["requested", "confirmed", true, true],
    ["requested", "cancelled", true, true],
    ["requested", "completed", false, false],
    ["requested", "no_show", false, false],
    ["confirmed", "requested", false, false],
    ["confirmed", "confirmed", false, false],
    ["confirmed", "cancelled", true, true],
    ["confirmed", "completed", false, true],
    ["confirmed", "no_show", false, true],
    ["completed", "requested", false, false],
    ["completed", "confirmed", false, false],
    ["completed", "cancelled", false, false],
    ["completed", "completed", false, false],
    ["completed", "no_show", false, true],
    ["no_show", "requested", false, false],
    ["no_show", "confirmed", false, false],
    ["no_show", "cancelled", false, false],
    ["no_show", "completed", false, true],
    ["no_show", "no_show", false, false],
    ["cancelled", "requested", false, false],
    ["cancelled", "confirmed", false, false],
    ["cancelled", "cancelled", false, false],
    ["cancelled", "completed", false, false],
    ["cancelled", "no_show", false, false],
  ];

  it("covers every pair of statuses", () => {
    expect(matrix).toHaveLength(
      APPOINTMENT_STATUSES.length * APPOINTMENT_STATUSES.length,
    );
  });

  it.each(matrix)("%s -> %s", (from, to, beforeStart, afterStart) => {
    expect(canTransition(from, to, START, BEFORE).ok).toBe(beforeStart);
    expect(canTransition(from, to, START, AFTER).ok).toBe(afterStart);
  });

  it("explains a completed or no-show before the start", () => {
    expect(canTransition("confirmed", "completed", START, BEFORE)).toEqual({
      ok: false,
      message: "Só depois do horário de início.",
    });
    expect(canTransition("confirmed", "no_show", START, BEFORE)).toEqual({
      ok: false,
      message: "Só depois do horário de início.",
    });
  });

  it("explains that a cancelled appointment is final", () => {
    const result = canTransition("cancelled", "confirmed", START, AFTER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/cancelado/i);
  });
});

describe("labels and editable statuses", () => {
  it("labels every status and reason in Portuguese", () => {
    expect(Object.keys(STATUS_LABELS).sort()).toEqual(
      [...APPOINTMENT_STATUSES].sort(),
    );
    expect(CANCELLATION_REASON_LABELS).toEqual({
      patient_request: "Pedido do paciente",
      rescheduled: "Remarcado",
      clinic_unavailable: "Clínica indisponível",
      other: "Outro",
    });
  });

  it("allows editing only requested and confirmed", () => {
    expect(APPOINTMENT_STATUSES.filter(isEditableStatus)).toEqual([
      "requested",
      "confirmed",
    ]);
  });
});

describe("appointmentFormSchema", () => {
  const base = {
    patientId: "7b0f8a5c-1d2e-4f3a-9b4c-5d6e7f8a9b0c",
    serviceId: "8c1f9b6d-2e3f-4a4b-8c5d-6e7f8a9b0c1d",
    customLabel: "",
    date: "2026-11-10",
    startTime: "10:00",
    durationMinutes: "60",
    idempotencyKey: "9d2a0c7e-3f4a-4b5c-9d6e-7f8a9b0c1d2e",
  };

  it("builds UTC instants from the clinic wall clock", () => {
    const r = appointmentFormSchema.parse(base);
    expect(r.startsAt.toISOString()).toBe("2026-11-10T13:00:00.000Z");
    expect(r.endsAt.toISOString()).toBe("2026-11-10T14:00:00.000Z");
    expect(r.durationMinutes).toBe(60);
    expect(r.customLabel).toBeNull();
    expect(r.acknowledgeWarnings).toBe(false);
  });

  it("reads the acknowledgement checkbox", () => {
    expect(
      appointmentFormSchema.parse({ ...base, acknowledgeWarnings: "on" })
        .acknowledgeWarnings,
    ).toBe(true);
    expect(
      appointmentFormSchema.parse({ ...base, acknowledgeWarnings: true })
        .acknowledgeWarnings,
    ).toBe(true);
  });

  it("accepts durations from 5 to 720 minutes", () => {
    for (const value of ["5", "7", "720"]) {
      expect(
        appointmentFormSchema.safeParse({ ...base, durationMinutes: value })
          .success,
      ).toBe(true);
    }
    for (const value of ["4", "721", "0", "", "abc", "60.5"]) {
      expect(
        appointmentFormSchema.safeParse({ ...base, durationMinutes: value })
          .success,
      ).toBe(false);
    }
  });

  it("requires the start on a 5-minute step", () => {
    expect(
      appointmentFormSchema.safeParse({ ...base, startTime: "10:05" }).success,
    ).toBe(true);
    expect(
      appointmentFormSchema.safeParse({ ...base, startTime: "10:03" }).success,
    ).toBe(false);
    expect(
      appointmentFormSchema.safeParse({ ...base, startTime: "24:00" }).success,
    ).toBe(false);
  });

  it("limits the label to 60 characters and trims it", () => {
    expect(
      appointmentFormSchema.parse({ ...base, customLabel: "  Encaixe  " })
        .customLabel,
    ).toBe("Encaixe");
    expect(
      appointmentFormSchema.safeParse({ ...base, customLabel: "a".repeat(60) })
        .success,
    ).toBe(true);
    expect(
      appointmentFormSchema.safeParse({ ...base, customLabel: "a".repeat(61) })
        .success,
    ).toBe(false);
  });

  it("does not require the label (the data layer knows the service)", () => {
    const withoutLabel: Partial<typeof base> = { ...base };
    delete withoutLabel.customLabel;
    expect(appointmentFormSchema.safeParse(withoutLabel).success).toBe(true);
  });

  it("rejects invalid ids, dates and keys", () => {
    expect(
      appointmentFormSchema.safeParse({ ...base, patientId: "x" }).success,
    ).toBe(false);
    expect(
      appointmentFormSchema.safeParse({ ...base, serviceId: "" }).success,
    ).toBe(false);
    expect(
      appointmentFormSchema.safeParse({ ...base, date: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      appointmentFormSchema.safeParse({ ...base, idempotencyKey: "1" }).success,
    ).toBe(false);
  });
});

describe("rescheduleSchema", () => {
  const id = "7b0f8a5c-1d2e-4f3a-9b4c-5d6e7f8a9b0c";

  it("parses ISO instants", () => {
    const r = rescheduleSchema.parse({
      id,
      startsAt: "2026-11-10T13:00:00.000Z",
      endsAt: "2026-11-10T13:45:00-00:00",
    });
    expect(r.startsAt.toISOString()).toBe("2026-11-10T13:00:00.000Z");
    expect(r.endsAt.toISOString()).toBe("2026-11-10T13:45:00.000Z");
    expect(r.acknowledgeWarnings).toBe(false);
  });

  it("rejects an end before the start and out-of-range durations", () => {
    const at = (endsAt: string) =>
      rescheduleSchema.safeParse({
        id,
        startsAt: "2026-11-10T13:00:00Z",
        endsAt,
      }).success;
    expect(at("2026-11-10T13:00:00Z")).toBe(false);
    expect(at("2026-11-10T12:00:00Z")).toBe(false);
    expect(at("2026-11-10T13:04:00Z")).toBe(false);
    expect(at("2026-11-11T01:01:00Z")).toBe(false);
    expect(at("2026-11-10T13:05:00Z")).toBe(true);
  });

  it("requires the start on a 5-minute step and whole minutes", () => {
    const at = (startsAt: string) =>
      rescheduleSchema.safeParse({
        id,
        startsAt,
        endsAt: "2026-11-10T15:00:00Z",
      }).success;
    expect(at("2026-11-10T13:03:00Z")).toBe(false);
    expect(at("2026-11-10T13:05:30Z")).toBe(false);
    expect(at("2026-11-10T13:05:00Z")).toBe(true);
  });

  it("rejects text that is not an instant and invalid ids", () => {
    expect(
      rescheduleSchema.safeParse({
        id,
        startsAt: "amanhã",
        endsAt: "2026-11-10T15:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      rescheduleSchema.safeParse({
        id: "x",
        startsAt: "2026-11-10T13:00:00Z",
        endsAt: "2026-11-10T15:00:00Z",
      }).success,
    ).toBe(false);
  });
});

describe("statusChangeSchema", () => {
  const id = "7b0f8a5c-1d2e-4f3a-9b4c-5d6e7f8a9b0c";

  it("requires a reason code to cancel", () => {
    expect(statusChangeSchema.safeParse({ id, to: "cancelled" }).success).toBe(
      false,
    );
    expect(
      statusChangeSchema.safeParse({ id, to: "cancelled", reason: "motivo" })
        .success,
    ).toBe(false);
    expect(
      statusChangeSchema.parse({ id, to: "cancelled", reason: "rescheduled" }),
    ).toEqual({ id, to: "cancelled", reason: "rescheduled" });
  });

  it("drops the reason for other statuses", () => {
    expect(
      statusChangeSchema.parse({ id, to: "confirmed", reason: "other" }),
    ).toEqual({ id, to: "confirmed" });
    expect(
      statusChangeSchema.parse({ id, to: "completed", reason: "" }),
    ).toEqual({ id, to: "completed" });
  });

  it("rejects unknown statuses", () => {
    expect(statusChangeSchema.safeParse({ id, to: "deleted" }).success).toBe(
      false,
    );
  });
});
