import { describe, expect, it } from "vitest";

import {
  applicationZipName,
  documentFileName,
  uniqueFileNames,
} from "./file-names";

describe("PDF file names", () => {
  it("follows the pattern in the output language, in ASCII", () => {
    expect(
      documentFileName({
        kind: "resume",
        language: "pt-BR",
        name: "Guilherme Monte",
        title: "Engenheiro de Software Sênior — Frontend",
      })
    ).toBe(
      "Guilherme_Monte_Engenheiro_de_Software_Senior_Frontend_Curriculo.pdf"
    );
    expect(
      documentFileName({
        kind: "cover_letter",
        language: "en-US",
        name: "Ana Maria Souza",
        title: "Staff Platform Engineer",
      })
    ).toBe("Ana_Souza_Staff_Platform_Engineer_Cover_Letter.pdf");
    expect(
      documentFileName({
        kind: "cover_letter",
        language: "pt-BR",
        name: "João",
        title: null,
      })
    ).toBe("Joao_Carta_de_Apresentacao.pdf");
  });

  it("appends the version's label when two would share a name", () => {
    expect(
      uniqueFileNames([
        { fileName: "A_Curriculo.pdf", label: null },
        { fileName: "A_Curriculo.pdf", label: "cópia" },
        { fileName: "A_Resume.pdf", label: "safe copy" },
      ])
    ).toEqual(["A_Curriculo.pdf", "A_Curriculo_copia.pdf", "A_Resume.pdf"]);
  });

  it("names the ZIP after the opening, so unzipping makes its folder", () => {
    expect(
      applicationZipName({ company: "Itaú Unibanco", title: "Dev Sênior" })
    ).toBe("Itau_Unibanco_Dev_Senior.zip");
  });
});
