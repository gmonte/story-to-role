import { describe, expect, it } from "vitest";

import { declaredLack } from "./declared-lack";

const lacks = {
  studied: ["Spark", "Airflow"],
  gaps: ["Cloud em produção (apenas estudos e projetos pessoais)."],
  notDone: ["não administrei infraestrutura em nuvem; não mexi em Kafka."],
};

describe("what the profile declares the person lacks", () => {
  it("is a competency only studied", () => {
    expect(declaredLack("Apache Spark", lacks)).toEqual({
      kind: "studied",
      text: "Spark",
    });
  });

  it("is named in a known gap or in what they did not do", () => {
    expect(declaredLack("Cloud", lacks)?.kind).toBe("gap");
    expect(declaredLack("kafka", lacks)?.kind).toBe("notDone");
  });

  it("is never guessed from a part of a word or a whole sentence", () => {
    expect(declaredLack("Spa", lacks)).toBeNull();
    expect(declaredLack("Python", lacks)).toBeNull();
    expect(
      declaredLack("5+ years building data pipelines with Spark", lacks)
    ).toBeNull();
  });
});
