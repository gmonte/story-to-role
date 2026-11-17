"use client";

import Link from "next/link";

import type { ProfileDocumentKind } from "@repo/api/domains/profile/schemas/profile";
import { useTranslation } from "@repo/intl/use-translation";
import { cn } from "@repo/web/lib/utils";

/**
 * My career's two documents, in the same editor (profile spec, "Job
 * preferences"): the profile, and the job preferences only screening reads.
 */
export function DocumentSwitch({ current }: { current: ProfileDocumentKind }) {
  const t = useTranslation();
  const documents: Array<{
    kind: ProfileDocumentKind;
    href: string;
    label: string;
  }> = [
    {
      kind: "profile",
      href: "/app/career",
      label: t.formatMessage({ defaultMessage: "Profile" }),
    },
    {
      kind: "preferences",
      href: "/app/career?document=preferences",
      label: t.formatMessage({ defaultMessage: "Job preferences" }),
    },
  ];
  return (
    <div className="bg-muted flex rounded-md p-0.5 text-xs">
      {documents.map((document) => (
        <Link
          key={document.kind}
          href={document.href}
          aria-current={document.kind === current ? "page" : undefined}
          className={cn(
            "flex-1 rounded px-2 py-1 text-center",
            document.kind === current
              ? "bg-background font-medium shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {document.label}
        </Link>
      ))}
    </div>
  );
}
