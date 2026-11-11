import sharp from "sharp";

import {
  getAnamnesis,
  recordPdfGenerated,
} from "@/modules/anamnesis/anamnesis";
import { renderAnamnesisPdf } from "@/modules/anamnesis/pdf";
import { requireAdmin } from "@/modules/auth/session";
import { getClinicMedia } from "@/modules/branding/photo";
import { getClinicLetterhead } from "@/modules/clinics/clinics";
import { ageOn, todayInClinic } from "@/modules/patients/fields";
import { getPatient } from "@/modules/patients/patients";

const NOT_FOUND = () => new Response("Not found", { status: 404 });

// The clinic logo is stored as WebP; the PDF takes PNG or JPEG.
async function loadLogo(clinicId: string, mediaId: string | null) {
  if (!mediaId) return null;
  const file = await getClinicMedia(clinicId, mediaId);
  if (!file) return null;
  try {
    if (file.mimeType === "image/png" || file.mimeType === "image/jpeg") {
      return { data: new Uint8Array(file.data), mimeType: file.mimeType };
    }
    const png = await sharp(file.data).png().toBuffer();
    return { data: new Uint8Array(png), mimeType: "image/png" };
  } catch {
    // A logo that cannot be read must not stop the PDF.
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; anamneseId: string }> },
) {
  const { clinicId, user } = await requireAdmin();
  const { id: patientId, anamneseId } = await params;

  const anamnesis = await getAnamnesis(clinicId, patientId, anamneseId);
  if (!anamnesis) return NOT_FOUND();
  const [patient, letterhead] = await Promise.all([
    getPatient(clinicId, patientId),
    getClinicLetterhead(clinicId),
  ]);
  if (!patient || !letterhead) return NOT_FOUND();

  const buffer = await renderAnamnesisPdf({
    header: {
      clinicName: letterhead.name,
      professionalName: letterhead.professionalName,
      professionalRegistration: letterhead.professionalRegistration,
      address: letterhead.address,
      whatsappPhone: letterhead.whatsappPhone,
      contactEmail: letterhead.contactEmail,
      logo: await loadLogo(clinicId, letterhead.logoMediaId),
    },
    patient: {
      name: patient.name,
      birthDate: patient.birthDate,
      age: patient.birthDate ? ageOn(patient.birthDate, todayInClinic()) : null,
      phone: patient.phone,
      landlinePhone: patient.landlinePhone,
      email: patient.email,
    },
    takenOn: anamnesis.takenOn,
    template: anamnesis.template,
    answers: anamnesis.answers,
  });
  await recordPdfGenerated(clinicId, patientId, anamneseId, user.id);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="anamnese-${anamnesis.takenOn}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
