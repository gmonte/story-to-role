import { creditSettings } from "@repo/api/domains/credits/credit-pricing";
import { getTranslation } from "@repo/intl/get-translation";
import type { Locale } from "@repo/intl/intl-config";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/web/components/ui/accordion";

import { LandingContainer, SectionHeading } from "./section-heading";

/** The questions people ask before signing up. */
export async function LandingFaq({ locale }: { locale: Locale }) {
  const t = await getTranslation(locale);
  const welcome = t.formatNumber(creditSettings.welcomeCredits);
  const questions = [
    {
      question: t.formatMessage({ defaultMessage: "Is it free to try?" }),
      answer: t.formatMessage(
        {
          defaultMessage:
            "Yes. Signing up gives you {credits} welcome credits, with no card: enough to write your profile, get your resume in Portuguese and English and one cover letter.",
        },
        { credits: welcome }
      ),
    },
    {
      question: t.formatMessage({
        defaultMessage: "What is a credit and what does it buy?",
      }),
      answer: t.formatMessage({
        defaultMessage:
          "Credits pay for the AI's work: messages to the profile agent, fit checks, resumes and cover letters. Each action shows its estimate before you confirm, and the editor itself is free.",
      }),
    },
    {
      question: t.formatMessage({
        defaultMessage: "How is it different from ChatGPT?",
      }),
      answer: t.formatMessage({
        defaultMessage:
          "A chat writes from whatever it knows and fills gaps with plausible text. StoryToRole writes only from your profile, marks where each line came from and declares what's missing instead of inventing it.",
      }),
    },
    {
      question: t.formatMessage({
        defaultMessage: "Will recruiters notice I used AI?",
      }),
      answer: t.formatMessage({
        defaultMessage:
          "Recruiters turn down applications that read as generic. Yours is built from your own facts and words, and you approve every change.",
      }),
    },
    {
      question: t.formatMessage({ defaultMessage: "Which languages?" }),
      answer: t.formatMessage({
        defaultMessage:
          "The interface is in English and Brazilian Portuguese, and each document can come out in Portuguese or English from the same profile.",
      }),
    },
    {
      question: t.formatMessage({
        defaultMessage: "Can I use my own AI key?",
      }),
      answer: t.formatMessage({
        defaultMessage:
          "Yes, on the subscription. With your Anthropic key, AI calls are paid by it instead of credits; a key from a Claude Max or Team organization uses that plan's monthly API credits.",
      }),
    },
    {
      question: t.formatMessage({
        defaultMessage: "Is my data private, and can I delete it?",
      }),
      answer: t.formatMessage({
        defaultMessage:
          "Your career content is encrypted with a key of your own and never used to train models. You can export everything as a ZIP, and deleting your account removes it at once.",
      }),
    },
    {
      question: t.formatMessage({ defaultMessage: "Can I cancel anytime?" }),
      answer: t.formatMessage({
        defaultMessage:
          "Yes. The subscription ends at the end of the billing period, you keep that month's credits until then, and your profile and documents stay.",
      }),
    },
  ];

  return (
    <section
      id="faq"
      className="bg-muted/60 scroll-mt-14 border-y py-16 md:py-24"
    >
      <LandingContainer className="flex flex-col gap-10">
        <SectionHeading
          eyebrow={t.formatMessage({ defaultMessage: "FAQ" })}
          title={t.formatMessage({
            defaultMessage: "Questions before you start",
          })}
        />
        <Accordion
          type="single"
          collapsible
          className="bg-card mx-auto w-full max-w-3xl rounded-xl border px-5 shadow-sm"
        >
          {questions.map((item) => (
            <AccordionItem key={item.question} value={item.question}>
              <AccordionTrigger className="text-base">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-pretty">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </LandingContainer>
    </section>
  );
}
