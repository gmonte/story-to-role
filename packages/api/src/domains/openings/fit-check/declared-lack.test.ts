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

  it("is never read into a word a line only mentions", () => {
    const profile = {
      studied: ["React Native"],
      gaps: ["Never led a team of more than 5 Python developers."],
      notDone: ["I did not define the AWS architecture of the platform."],
    };
    // React is not React Native; an app in it is.
    expect(declaredLack("React", profile)).toBeNull();
    expect(declaredLack("React Native apps", profile)?.kind).toBe("studied");
    expect(declaredLack("Python", profile)).toBeNull();
    expect(declaredLack("AWS", profile)).toBeNull();
    // Either of two: one being lacking is not a gap.
    expect(declaredLack("React or React Native", profile)).toBeNull();
  });
});
