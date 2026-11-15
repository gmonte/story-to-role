import { foldAccents } from "@repo/api/utils/text/fold-accents";

import type { DocumentKind, OutputLanguage } from "../schemas/document";

const fixedWords: Record<DocumentKind, Record<OutputLanguage, string>> = {
  resume: { "en-US": "Resume", "pt-BR": "Curriculo" },
  cover_letter: {
    "en-US": "Cover_Letter",
    "pt-BR": "Carta_de_Apresentacao",
  },
};

/**
 * ASCII only (resume spec, "Download"): accents, cedillas and symbols go,
 * spaces become "_", since some tracking systems break on such names.
 */
export function asciiName(text: string) {
  return foldAccents(text)
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * `<FirstName>_<LastName>_<Title>_Resume.pdf`, with the fixed words in the
 * document's language. The name is the one printed on the document; the
 * company never appears. A suggestion the user can edit.
 */
export function documentFileName(input: {
  kind: DocumentKind;
  language: OutputLanguage;
  name: string;
  title: string | null;
}) {
  const words = input.name.trim().split(/\s+/).filter(Boolean);
  const person =
    words.length > 1 ? [words[0], words.at(-1)!] : words.slice(0, 1);
  return `${[...person, input.title ?? ""]
    .map(asciiName)
    .filter(Boolean)
    .join("_")}_${fixedWords[input.kind][input.language]}.pdf`;
}

/** Versions that would share a file name get their label appended. */
export function uniqueFileNames(
  files: Array<{ fileName: string; label: string | null }>
) {
  const taken = new Set<string>();
  return files.map(({ fileName, label }) => {
    let name = fileName;
    if (taken.has(name) && label) {
      name = fileName.replace(/\.pdf$/, `_${asciiName(label)}.pdf`);
    }
    for (let n = 2; taken.has(name); n++) {
      name = fileName.replace(/\.pdf$/, `_${n}.pdf`);
    }
    taken.add(name);
    return name;
  });
}

/** `<Company>_<Title>.zip`: unzipping makes a folder named after the opening. */
export function applicationZipName(input: {
  company: string | null;
  title: string | null;
}) {
  return `${
    [input.company ?? "", input.title ?? ""]
      .map(asciiName)
      .filter(Boolean)
      .join("_") || "Application"
  }.zip`;
}
