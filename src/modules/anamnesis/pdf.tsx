// react-pdf's Image is not an HTML img: it has no alt prop.
/* eslint-disable jsx-a11y/alt-text */
import {
  Document,
  Image,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import { formatStoredPhone } from "@/modules/patients/fields";

import { answeredSections, type Answers } from "./fields";
import type { AnamnesisTemplate } from "./template";

// The printable anamnesis. No "server-only" here so the unit test can render
// it; the route that serves it is the server boundary.

export type PdfHeader = {
  clinicName: string;
  professionalName: string | null;
  professionalRegistration: string | null;
  address: string | null;
  whatsappPhone: string | null;
  contactEmail: string | null;
  // PNG or JPEG only (the route converts what the clinic stored).
  logo: { data: Uint8Array; mimeType: string } | null;
};

export type PdfPatient = {
  name: string;
  birthDate: string | null;
  age: number | null;
  phone: string | null;
  landlinePhone: string | null;
  email: string | null;
};

type Input = {
  header: PdfHeader;
  patient: PdfPatient;
  takenOn: string;
  template: AnamnesisTemplate;
  answers: Answers;
};

const TITLE = "Anamnese Integrativa";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1f2937",
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 44,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#9ca3af",
  },
  logo: { width: 56, height: 56, objectFit: "contain" },
  clinicName: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  muted: { color: "#4b5563", fontSize: 9 },
  title: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    marginTop: 16,
    marginBottom: 2,
  },
  identification: {
    marginTop: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 3,
    gap: 2,
  },
  bold: { fontFamily: "Helvetica-Bold" },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 16,
    marginBottom: 6,
    paddingBottom: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: "#9ca3af",
  },
  item: { marginBottom: 7 },
  // Not on the page style: a page-level lineHeight makes react-pdf drop the
  // text of render functions (the page number).
  answer: { lineHeight: 1.4 },
  question: { fontFamily: "Helvetica-Bold", fontSize: 9.5 },
  signatures: {
    marginTop: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 28,
  },
  signature: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: "#1f2937",
    paddingTop: 3,
    textAlign: "center",
    fontSize: 9,
  },
  place: { marginTop: 22, fontSize: 9 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 44,
    right: 44,
    textAlign: "center",
    fontSize: 8,
    color: "#6b7280",
  },
});

// "2026-11-10" -> "10/11/2026".
function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function contactLine(header: PdfHeader): string | null {
  const parts = [
    header.address,
    header.whatsappPhone
      ? `WhatsApp ${formatStoredPhone(header.whatsappPhone)}`
      : null,
    header.contactEmail,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("  |  ") : null;
}

function AnamnesisDocument({
  header,
  patient,
  takenOn,
  template,
  answers,
}: Input) {
  const sections = answeredSections(template, answers);
  const professional = [
    header.professionalName,
    header.professionalRegistration,
  ]
    .filter(Boolean)
    .join(" - ");
  const contact = contactLine(header);
  const birth = patient.birthDate
    ? `${formatDate(patient.birthDate)}${
        patient.age !== null ? ` (${patient.age} anos)` : ""
      }`
    : null;
  const phones = [patient.phone, patient.landlinePhone]
    .filter((phone): phone is string => Boolean(phone))
    .map(formatStoredPhone)
    .join(" / ");
  const identification: [string, string | null][] = [
    ["Nascimento", birth],
    ["Telefone", phones || null],
    ["E-mail", patient.email],
  ];

  return (
    <Document title={`${TITLE} - ${formatDate(takenOn)}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {header.logo ? (
            <Image
              style={styles.logo}
              src={{
                data: Buffer.from(header.logo.data),
                format: formatOf(header.logo.mimeType),
              }}
            />
          ) : null}
          <View>
            <Text style={styles.clinicName}>{header.clinicName}</Text>
            {professional ? <Text>{professional}</Text> : null}
            {contact ? <Text style={styles.muted}>{contact}</Text> : null}
          </View>
        </View>

        <Text style={styles.title}>{TITLE}</Text>
        <Text style={styles.muted}>Data: {formatDate(takenOn)}</Text>

        <View style={styles.identification}>
          <Text>
            <Text style={styles.bold}>Paciente: </Text>
            {patient.name}
          </Text>
          {identification.map(([label, value]) =>
            value ? (
              <Text key={label}>
                <Text style={styles.bold}>{label}: </Text>
                {value}
              </Text>
            ) : null,
          )}
        </View>

        {sections.map(({ section, items }) => (
          <View key={section.id}>
            <Text style={styles.sectionTitle} minPresenceAhead={60}>
              {section.title}
            </Text>
            {items.map(({ question, text }) => (
              <View key={question.id} style={styles.item}>
                <Text style={styles.question}>{question.label}</Text>
                <Text style={styles.answer}>{text}</Text>
              </View>
            ))}
          </View>
        ))}

        <View wrap={false}>
          <Text style={styles.place}>
            Local e data: ______________________, ____/____/________
          </Text>
          <View style={styles.signatures}>
            <Text style={styles.signature}>Assinatura da paciente</Text>
            <Text style={styles.signature}>Assinatura da profissional</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text
            render={({ pageNumber, totalPages }) =>
              `página ${pageNumber} de ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

function formatOf(mimeType: string): "png" | "jpg" {
  return mimeType === "image/png" ? "png" : "jpg";
}

export async function renderAnamnesisPdf(input: Input): Promise<Buffer> {
  return renderToBuffer(<AnamnesisDocument {...input} />);
}
