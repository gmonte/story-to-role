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
import { renderFitted, resumeDensity, type DensityStep } from "./pdf-density";

const navy = "#1f3a68";
const grey = "#666666";

const createStyles = (step: DensityStep) => {
  const d = resumeDensity(step);
  return StyleSheet.create({
    page: {
      paddingTop: d.margin,
      paddingBottom: d.margin,
      paddingHorizontal: 36,
      fontFamily: "Helvetica",
      fontSize: 9.5,
      lineHeight: d.lineHeight,
      color: "#1a1a1a",
    },
    name: {
      fontFamily: "Helvetica-Bold",
      fontSize: 18,
      // Its own line height: the page's would be too short for this size.
      lineHeight: 1.2,
      color: navy,
      marginBottom: 4,
    },
    titleLine: {
      fontFamily: "Helvetica-Bold",
      fontSize: 10.5,
      marginBottom: 2,
    },
    contacts: { color: grey, fontSize: 8.5 },
    section: { marginTop: d.sectionGap },
    sectionTitle: {
      fontFamily: "Helvetica-Bold",
      fontSize: 10,
      color: navy,
      textTransform: "uppercase",
      borderBottomWidth: 0.6,
      borderBottomColor: navy,
      paddingBottom: 2,
      marginBottom: d.titleGap,
    },
    justified: { textAlign: "justify" },
    bold: { fontFamily: "Helvetica-Bold" },
    italic: { fontFamily: "Helvetica-Oblique" },
    entry: { marginBottom: d.entryGap },
    entryHeader: { flexDirection: "row", justifyContent: "space-between" },
    period: { color: grey, fontSize: 8.5 },
    bullet: { flexDirection: "row", marginTop: d.bulletGap },
    bulletMark: { width: 10 },
    bulletText: { flex: 1 },
  });
};

type Styles = ReturnType<typeof createStyles>;

function Bullet({ text, styles }: { text: string; styles: Styles }) {
  // A hanging indent: the mark in its own column, the text wrapping beside it.
  return (
    <View style={styles.bullet} wrap={false}>
      <Text style={styles.bulletMark}>•</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function credential(
  entry: CredentialEntry,
  language: OutputLanguage,
  styles: Styles
) {
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
  styles,
}: {
  section: ResumeSection;
  language: OutputLanguage;
  styles: Styles;
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
          {/* The company, title and first bullet stay together: a heading
              alone at the foot of a page moves to the next one. */}
          <View wrap={false}>
            <View style={styles.entryHeader}>
              <Text style={styles.bold}>{entry.employer}</Text>
              <Text style={styles.period}>
                {formatPeriod(entry.startDate, entry.endDate, language)}
              </Text>
            </View>
            <Text style={styles.italic}>{positionTitleLine(entry)}</Text>
            {entry.lines.slice(0, 1).map((line) => (
              <Bullet key={line.id} text={line.text} styles={styles} />
            ))}
          </View>
          {entry.lines.slice(1).map((line) => (
            <Bullet key={line.id} text={line.text} styles={styles} />
          ))}
        </View>
      ));
    case "projects":
      // Like an experience: the name where the employer goes, the period
      // aligned right, the link in italics below (resume spec, "Layout").
      return section.entries.map((entry) => (
        <View key={entry.projectId} style={styles.entry}>
          <View wrap={false}>
            <View style={styles.entryHeader}>
              <Text style={styles.bold}>{entry.name}</Text>
              {(entry.startDate ?? entry.endDate) && (
                <Text style={styles.period}>
                  {formatPeriod(entry.startDate, entry.endDate, language)}
                </Text>
              )}
            </View>
            {entry.role && <Text style={styles.italic}>{entry.role}</Text>}
            {entry.link && <Text style={styles.period}>{entry.link}</Text>}
            {entry.lines.slice(0, 1).map((line) => (
              <Bullet key={line.id} text={line.text} styles={styles} />
            ))}
          </View>
          {entry.lines.slice(1).map((line) => (
            <Bullet key={line.id} text={line.text} styles={styles} />
          ))}
        </View>
      ));
    default:
      return section.entries.map((entry) =>
        credential(entry, language, styles)
      );
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
  step = 0,
}: {
  content: ResumeContent;
  language: OutputLanguage;
  step?: DensityStep;
}) {
  const styles = createStyles(step);
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
            <Text style={styles.sectionTitle} minPresenceAhead={60}>
              {sectionTitles[language][section.kind]}
            </Text>
            <SectionBody
              section={section}
              language={language}
              styles={styles}
            />
          </View>
        ))}
      </Page>
    </Document>
  );
}

/** Renders the resume at one density step and reads its real length. */
export async function renderResumePdf(input: {
  content: ResumeContent;
  language: OutputLanguage;
  step?: DensityStep;
}) {
  const step = input.step ?? 0;
  const bytes = await renderToBuffer(
    <ResumeDocument
      content={input.content}
      language={input.language}
      step={step}
    />
  );
  return { bytes, pages: countPdfPages(bytes), step };
}

/**
 * Renders the resume at the first density step that fits `maxPages`; when
 * none does, at step 0 (the length warning stays as it is).
 */
export async function renderResumeFitted(input: {
  content: ResumeContent;
  language: OutputLanguage;
  maxPages: number;
}) {
  return renderFitted(
    (step) => renderResumePdf({ ...input, step }),
    input.maxPages
  );
}

/** Pages in a PDF: its page objects ("/Type /Page", not "/Pages"). */
export function countPdfPages(bytes: Buffer) {
  return (bytes.toString("latin1").match(/\/Type\s*\/Page(?![a-z])/g) ?? [])
    .length;
}
