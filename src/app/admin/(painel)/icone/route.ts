import { requireAdmin } from "@/modules/auth/session";
import { getClinicBranding } from "@/modules/branding/branding";
import { initialsFor } from "@/modules/branding/palettes";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Tab icon of the signed-in clinic: its initial on its brand color.
export async function GET() {
  const session = await requireAdmin();
  const branding = await getClinicBranding(session.clinicId);
  if (!branding) return new Response(null, { status: 404 });
  const { light } = branding.palette;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="32" fill="${escapeXml(light.brand)}"/><text x="32" y="32" text-anchor="middle" dominant-baseline="central" font-family="Georgia, serif" font-size="34" font-weight="700" fill="${escapeXml(light["brand-foreground"])}">${escapeXml(initialsFor(branding.displayName))}</text></svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, no-store",
    },
  });
}
