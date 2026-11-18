import {
  Document,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import type { CoverLetterContent } from "../schemas/cover-letter-content";
import { letterDensity, renderFitted, type DensityStep } from "./pdf-density";
import { countPdfPages } from "./resume-pdf";

const navy = "#1f3a68";
const grey = "#666666";

const createStyles = (step: DensityStep) => {
  const d = letterDensity[step];
  return StyleSheet.create({
    page: {
      paddingTop: d.margin,
      paddingBottom: d.margin,
      paddingHorizontal: 44,
      fontFamily: "Helvetica",
      fontSize: 10,
      lineHeight: d.lineHeight,
      color: "#1a1a1a",
    },
    name: {
      fontFamily: "Helvetica-Bold",
      fontSize: 18,
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
    body: { marginTop: d.bodyGap },
    paragraph: { marginBottom: d.paragraphGap, textAlign: "justify" },
    closing: { marginTop: 6 },
  });
};

/**
 * The cover letter in the specified layout (resume spec, "Layout"): the
 * resume's header (name, title line, contacts), then the letter body, on
 * A4 in Helvetica.
 */
export function LetterDocument({
  content,
  step = 0,
}: {
  content: CoverLetterContent;
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

/** Renders the letter at one density step and reads its real length. */
export async function renderLetterPdf(
  content: CoverLetterContent,
  step: DensityStep = 0
) {
  const bytes = await renderToBuffer(
    <LetterDocument content={content} step={step} />
  );
  return { bytes, pages: countPdfPages(bytes), step };
}

/** The letter at the first density step that fits `maxPages`. */
export function renderLetterFitted(
  content: CoverLetterContent,
  maxPages: number
) {
  return renderFitted((step) => renderLetterPdf(content, step), maxPages);
}
