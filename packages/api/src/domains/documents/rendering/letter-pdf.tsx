import {
  Document,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import type { CoverLetterContent } from "../schemas/cover-letter-content";
import { countPdfPages } from "./resume-pdf";

const navy = "#1f3a68";
const grey = "#666666";

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 56,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    lineHeight: 1.45,
    color: "#1a1a1a",
  },
  name: {
    fontFamily: "Helvetica-Bold",
    fontSize: 20,
    lineHeight: 1.2,
    color: navy,
    marginBottom: 4,
  },
  titleLine: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 2 },
  contacts: { color: grey, fontSize: 9 },
  body: { marginTop: 24 },
  paragraph: { marginBottom: 10, textAlign: "justify" },
  closing: { marginTop: 6 },
});

/**
 * The cover letter in the specified layout (resume spec, "Layout"): the
 * resume's header (name, title line, contacts), then the letter body, on
 * A4 in Helvetica.
 */
export function LetterDocument({ content }: { content: CoverLetterContent }) {
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
        <View style={styles.body}>
          <Text style={styles.paragraph}>{content.greeting}</Text>
          {content.paragraphs.map((line) => (
            <Text key={line.id} style={styles.paragraph}>
              {line.text}
            </Text>
          ))}
          <Text style={styles.closing}>{content.closing}</Text>
        </View>
      </Page>
    </Document>
  );
}

/** Renders the letter and reads its real length from the PDF itself. */
export async function renderLetterPdf(content: CoverLetterContent) {
  const bytes = await renderToBuffer(<LetterDocument content={content} />);
  return { bytes, pages: countPdfPages(bytes) };
}
