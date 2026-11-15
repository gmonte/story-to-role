/* eslint-disable formatjs/no-literal-string-in-jsx -- the PDF prints the
   document's own content and typography (bullets, separators), never
   interface text; section names come from output-conventions per language. */
import {
  Document,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import type { OutputLanguage } from "../schemas/document";
import type {
  CredentialEntry,
  ResumeContent,
  ResumeSection,
} from "../schemas/resume-content";
import {
  formatPeriod,
  positionTitleLine,
  sectionTitles,
} from "./output-conventions";

const navy = "#1f3a68";
const grey = "#666666";

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.35,
    color: "#1a1a1a",
  },
  name: {
    fontFamily: "Helvetica-Bold",
    fontSize: 20,
    // Its own line height: the page's would be too short for this size.
    lineHeight: 1.2,
    color: navy,
    marginBottom: 4,
  },
  titleLine: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 2 },
  contacts: { color: grey, fontSize: 9 },
  section: { marginTop: 12 },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    color: navy,
    textTransform: "uppercase",
    borderBottomWidth: 0.6,
    borderBottomColor: navy,
    paddingBottom: 2,
    marginBottom: 5,
  },
  justified: { textAlign: "justify" },
  bold: { fontFamily: "Helvetica-Bold" },
  italic: { fontFamily: "Helvetica-Oblique" },
  entry: { marginBottom: 6 },
  entryHeader: { flexDirection: "row", justifyContent: "space-between" },
  period: { color: grey, fontSize: 9 },
  bullet: { flexDirection: "row", marginTop: 1.5 },
  bulletMark: { width: 10 },
  bulletText: { flex: 1 },
});

function Bullet({ text }: { text: string }) {
  // A hanging indent: the mark in its own column, the text wrapping beside it.
  return (
    <View style={styles.bullet} wrap={false}>
      <Text style={styles.bulletMark}>•</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function credential(entry: CredentialEntry, language: OutputLanguage) {
  const title = entry.level ? `${entry.title} (${entry.level})` : entry.title;
  const period =
    entry.startDate || entry.endDate
      ? formatPeriod(entry.startDate, entry.endDate, language)
      : "";
  return (
    <Text key={entry.credentialId} style={styles.entry}>
      {entry.institution && (
        <Text style={styles.bold}>{`${entry.institution} · `}</Text>
      )}
      {title}
      {period && <Text style={styles.period}>{`  ${period}`}</Text>}
    </Text>
  );
}

function SectionBody({
  section,
  language,
}: {
  section: ResumeSection;
  language: OutputLanguage;
}) {
  switch (section.kind) {
    case "summary":
      return <Text style={styles.justified}>{section.line.text}</Text>;
    case "skills":
      return section.groups.map((group) => (
        <Text key={group.id}>
          <Text style={styles.bold}>{`${group.label}: `}</Text>
          {group.text}
        </Text>
      ));
    case "experience":
      return section.entries.map((entry) => (
        <View key={entry.positionId} style={styles.entry}>
          <View style={styles.entryHeader} wrap={false}>
            <Text style={styles.bold}>{entry.employer}</Text>
            <Text style={styles.period}>
              {formatPeriod(entry.startDate, entry.endDate, language)}
            </Text>
          </View>
          <Text style={styles.italic}>{positionTitleLine(entry)}</Text>
          {entry.lines.map((line) => (
            <Bullet key={line.id} text={line.text} />
          ))}
        </View>
      ));
    case "projects":
      return section.entries.map((entry) => (
        <View key={entry.projectId} style={styles.entry}>
          <Text style={styles.bold}>{entry.name}</Text>
          {entry.lines.map((line) => (
            <Bullet key={line.id} text={line.text} />
          ))}
        </View>
      ));
    default:
      return section.entries.map((entry) => credential(entry, language));
  }
}

/**
 * The resume in the specified layout (resume spec, "Layout"): A4, one
 * column, Helvetica, nothing an applicant tracking system would scramble.
 * The evidence trace never reaches the PDF.
 */
export function ResumeDocument({
  content,
  language,
}: {
  content: ResumeContent;
  language: OutputLanguage;
}) {
  const { header } = content;
  return (
    <Document title={header.name} author={header.name}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.name}>{header.name}</Text>
        {header.titleLine && (
          <Text style={styles.titleLine}>{header.titleLine}</Text>
        )}
        {header.contacts.length > 0 && (
          <Text style={styles.contacts}>{header.contacts.join(" | ")}</Text>
        )}
        {header.city && <Text style={styles.contacts}>{header.city}</Text>}
        {content.sections.map((section) => (
          <View key={section.kind} style={styles.section}>
            <Text style={styles.sectionTitle} minPresenceAhead={30}>
              {sectionTitles[language][section.kind]}
            </Text>
            <SectionBody section={section} language={language} />
          </View>
        ))}
      </Page>
    </Document>
  );
}

/** Renders the resume and reads its real length from the PDF itself. */
export async function renderResumePdf(input: {
  content: ResumeContent;
  language: OutputLanguage;
}) {
  const bytes = await renderToBuffer(
    <ResumeDocument content={input.content} language={input.language} />
  );
  return { bytes, pages: countPdfPages(bytes) };
}

/** Pages in a PDF: its page objects ("/Type /Page", not "/Pages"). */
export function countPdfPages(bytes: Buffer) {
  return (bytes.toString("latin1").match(/\/Type\s*\/Page(?![a-z])/g) ?? [])
    .length;
}
