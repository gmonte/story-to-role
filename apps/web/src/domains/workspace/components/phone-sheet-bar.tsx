"use client";

import type { ReactNode } from "react";

import { Button } from "@repo/web/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/web/components/ui/sheet";
import { cn } from "@repo/web/lib/utils";

export type PhoneSheetTab = {
  key: string;
  label: string;
  content: ReactNode;
  /** Content that scrolls in the sheet, with its margin; a chat scrolls itself. */
  scroll?: boolean;
};

/**
 * The side column on a phone: a bottom bar with one button per tab, each
 * opening a tall sheet. `open` is the key of the sheet open, null for none.
 */
export function PhoneSheetBar({
  tabs,
  open,
  onOpenChange,
}: {
  tabs: PhoneSheetTab[];
  open: string | null;
  onOpenChange: (open: string | null) => void;
}) {
  const current = tabs.find((tab) => tab.key === open);

  return (
    <>
      <div className="bg-background/95 flex shrink-0 gap-2 border-t px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur">
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            variant="outline"
            className="h-11 flex-1"
            onClick={() => onOpenChange(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>
      <Sheet
        open={!!current}
        onOpenChange={(next) => !next && onOpenChange(null)}
      >
        <SheetContent
          side="bottom"
          className="h-[92dvh] gap-0 p-0 pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader className="border-b p-4 pr-12">
            <SheetTitle>{current?.label}</SheetTitle>
            <SheetDescription className="sr-only">
              {current?.label}
            </SheetDescription>
          </SheetHeader>
          {current && (
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col",
                current.scroll ? "gap-4 overflow-y-auto p-4" : "overflow-hidden"
              )}
            >
              {current.content}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
