import type { ReactNode } from "react";

import { Separator } from "@repo/web/components/ui/separator";
import { SidebarInset, SidebarTrigger } from "@repo/web/components/ui/sidebar";

/**
 * One screen of the workspace: the chat in the center and the side panel on
 * the right, as in the Claude app. A screen that opens files beside the
 * panel passes its own `WorkspaceBody` as `body`. On a wide screen it is a
 * raised panel over the sidebar's backdrop (shadcn's inset sidebar).
 */
export function WorkspacePage({
  title,
  chat,
  panel,
  body,
}: {
  title: string;
  chat?: ReactNode;
  panel?: ReactNode;
  body?: ReactNode;
}) {
  // Clipped, not hidden: a hidden overflow can still be scrolled by the
  // browser (bringing a focused field into view), pushing the header out of
  // sight; only the columns inside scroll.
  return (
    <SidebarInset className="h-svh min-w-0 overflow-clip md:h-[calc(100svh-1rem)] md:border">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-4!" />
        <h1 className="truncate text-sm font-medium">{title}</h1>
      </header>
      {body ?? (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">{chat}</div>
          {panel && (
            <aside className="bg-muted/60 hidden w-80 shrink-0 overflow-y-auto border-l p-4 empty:hidden lg:block xl:w-96">
              {panel}
            </aside>
          )}
        </div>
      )}
    </SidebarInset>
  );
}
