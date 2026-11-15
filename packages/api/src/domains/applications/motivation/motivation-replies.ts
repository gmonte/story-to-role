import type { InterviewLanguage } from "@repo/api/domains/career/schemas/career";

export type BlockedAnswer = "off_topic" | "blocked_override" | "cooldown";

/**
 * Replies written by code, never by a model (guided-interview spec,
 * guardrails 3 and 8), in the interview language, steering the user back to
 * the motivation question.
 */
const replies: Record<InterviewLanguage, Record<BlockedAnswer, string>> = {
  "en-US": {
    off_topic:
      "Here I can only talk about this opening and why you want it. Back to the question:",
    blocked_override:
      "I can't change how I work. Back to this opening and the question:",
    cooldown:
      "Let's take a short break. You can answer again in a few minutes:",
  },
  "pt-BR": {
    off_topic:
      "Aqui eu só posso falar desta vaga e de por que você a quer. Voltando à pergunta:",
    blocked_override:
      "Não posso mudar a forma como trabalho. Voltando a esta vaga e à pergunta:",
    cooldown:
      "Vamos fazer uma pausa curta. Você pode responder de novo em alguns minutos:",
  },
};

/** When the interviewer returns no question before enough answers. */
const fallbackQuestions: Record<InterviewLanguage, string[]> = {
  "en-US": [
    "What drew you to this company?",
    "How does this role fit the moment of your career?",
    "Do you have any personal link to the company's product or mission?",
  ],
  "pt-BR": [
    "O que te atraiu nesta empresa?",
    "Como esta vaga se encaixa no momento da sua carreira?",
    "Você tem alguma ligação pessoal com o produto ou a missão da empresa?",
  ],
};

export const motivationReply = (
  kind: BlockedAnswer,
  language: InterviewLanguage
) => replies[language][kind];

export const fallbackQuestion = (language: InterviewLanguage, index: number) =>
  fallbackQuestions[language][index % fallbackQuestions[language].length];
