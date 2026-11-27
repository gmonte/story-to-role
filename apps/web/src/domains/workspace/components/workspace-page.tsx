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
  // On a phone the window scrolls, under a sticky header: iOS browsers
  // fold their toolbars as the window scrolls, and with only inner columns
  // scrolling, Brave left them half folded after a pull to refresh, hiding
  // the header. From md up the page fills the screen and its columns scroll.
  // Clipped, not hidden: a hidden overflow can still be scrolled by the
  // browser, pushing the header out of sight. The sticky bars are layers of
  // their own (transform-gpu): iOS paints composited content over a sticky
  // bar whatever its z-index.
  return (
    <SidebarInset className="min-h-svh min-w-0 overflow-x-clip md:h-[calc(100svh-1rem)] md:min-h-0 md:overflow-clip md:border">
      <header className="bg-background sticky top-0 z-30 flex h-12 shrink-0 transform-gpu items-center gap-2 border-b px-3 md:static">
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
