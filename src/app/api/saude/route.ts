import {
  measureDbLatency,
  recordHealthCheck,
} from "@/modules/platform/monitoring";

// Health check for an uptime monitor (UptimeRobot, Better Stack...): 200 when
// the database answers, 503 when it does not. It also feeds the latency chart
// on root's monitoring screen, at most one sample every few minutes however
// often it is called. Answers nothing but "ok" and a time.

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const latency = await measureDbLatency(3);
    await recordHealthCheck(latency.median, "saude").catch(() => {});
    return Response.json(
      { ok: true, dbMs: Math.round(latency.median) },
      { headers: NO_STORE },
    );
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: NO_STORE });
  }
}
