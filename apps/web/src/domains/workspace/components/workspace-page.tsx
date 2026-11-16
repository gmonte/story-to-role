import type { ReactNode } from "react";

import { Separator } from "@repo/web/components/ui/separator";
import { SidebarTrigger } from "@repo/web/components/ui/sidebar";

/**
 * One screen of the workspace: the chat in the center and the side panel on
 * the right, as in the Claude app.
 */
export function WorkspacePage({
  title,
  chat,
  panel,
  preview,
}: {
  title: string;
  chat: ReactNode;
  panel?: ReactNode;
  // A file opened from the panel, further right (empty when none is open).
  preview?: ReactNode;
}) {
  return (
    <div className="flex h-svh min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-4!" />
        <h1 className="truncate text-sm font-medium">{title}</h1>
      </header>
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">{chat}</main>
        {panel && (
          // A panel that renders nothing (My career before the privacy
          // notice) leaves no empty column behind.
          <aside className="bg-muted/30 hidden w-80 shrink-0 overflow-y-auto border-l p-4 empty:hidden lg:block xl:w-96">
            {panel}
          </aside>
        )}
        {preview && (
          <aside className="bg-background hidden w-[28rem] shrink-0 border-l empty:hidden lg:block xl:w-[32rem]">
            {preview}
          </aside>
        )}
      </div>
    </div>
  );
}
