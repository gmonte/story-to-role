import { Check, Minus, X } from "lucide-react";

import { getTranslation } from "@repo/intl/get-translation";
import type { Locale } from "@repo/intl/intl-config";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/web/components/ui/table";
import { cn } from "@repo/web/lib/utils";

import { LandingContainer, SectionHeading } from "./section-heading";

type Mark = "yes" | "partial" | "no";

/** StoryToRole beside the kinds of tool people use today. */
export async function LandingComparison({ locale }: { locale: Locale }) {
  const t = await getTranslation(locale);
  const columns = [
    "StoryToRole",
    t.formatMessage({ defaultMessage: "Resume builders" }),
    t.formatMessage({ defaultMessage: "Auto-appliers" }),
    t.formatMessage({ defaultMessage: "Generic AI chat" }),
  ];
  const rows: Array<{ label: string; marks: [Mark, Mark, Mark, Mark] }> = [
    {
      label: t.formatMessage({
        defaultMessage: "One source of truth for every document",
      }),
      marks: ["yes", "partial", "no", "no"],
    },
    {
      label: t.formatMessage({
        defaultMessage: "Never invents what you didn't do",
      }),
      marks: ["yes", "partial", "no", "no"],
    },
    {
      label: t.formatMessage({
        defaultMessage: "Tells you when an opening isn't worth it",
      }),
      marks: ["yes", "no", "no", "partial"],
    },
    {
      label: t.formatMessage({
        defaultMessage: "Portuguese and English from the same profile",
      }),
      marks: ["yes", "partial", "no", "partial"],
    },
    {
      label: t.formatMessage({
        defaultMessage: "Tracks every application",
      }),
      marks: ["yes", "no", "partial", "no"],
    },
    {
      label: t.formatMessage({
        defaultMessage: "Nothing sent without you",
      }),
      marks: ["yes", "yes", "no", "yes"],
    },
  ];
  const markLabel = {
    yes: t.formatMessage({ defaultMessage: "Yes" }),
    partial: t.formatMessage({ defaultMessage: "Partly" }),
    no: t.formatMessage({ defaultMessage: "No" }),
  };

  return (
    <section className="bg-muted/60 border-y py-16 md:py-24">
      <LandingContainer className="flex flex-col gap-12">
        <SectionHeading
          eyebrow={t.formatMessage({ defaultMessage: "Comparison" })}
          title={t.formatMessage({
            defaultMessage: "Built to apply well, not to apply more",
          })}
        />
        <div className="bg-card overflow-hidden rounded-xl border shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-48" />
                {columns.map((column, index) => (
                  <TableHead
                    key={column}
                    className={cn(
                      "text-center",
                      index === 0 &&
                        "text-foreground bg-brand-accent/10 font-semibold"
                    )}
                  >
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="font-medium whitespace-normal">
                    {row.label}
                  </TableCell>
                  {row.marks.map((mark, index) => (
                    <TableCell
                      key={columns[index]}
                      className={cn(
                        "text-center",
                        index === 0 && "bg-brand-accent/10"
                      )}
                    >
                      <span className="sr-only">{markLabel[mark]}</span>
                      {mark === "yes" ? (
                        <Check
                          aria-hidden="true"
                          className={cn(
                            "mx-auto size-4",
                            index === 0
                              ? "text-brand-accent"
                              : "text-muted-foreground"
                          )}
                        />
                      ) : mark === "partial" ? (
                        <Minus
                          aria-hidden="true"
                          className="text-muted-foreground mx-auto size-4"
                        />
                      ) : (
                        <X
                          aria-hidden="true"
                          className="text-muted-foreground/50 mx-auto size-4"
                        />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </LandingContainer>
    </section>
  );
}
