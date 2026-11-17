import { Space_Grotesk } from "next/font/google";
import { cookies } from "next/headers";

import { SidebarProvider } from "@repo/web/components/ui/sidebar";

import { AccountPreparing } from "~/domains/workspace/components/account-preparing";
import { AppSidebar } from "~/domains/workspace/components/app-sidebar";
import { caller } from "~/tools/trpc/server";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["600"],
});

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A fresh sign-up lands here before the Clerk webhook creates the local
  // user, so every page would fail with "User not found" for a moment.
  const { ready } = await caller.users.accountReady({});
  if (!ready) return <AccountPreparing />;

  // shadcn's sidebar remembers whether it was collapsed in this cookie.
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <div className={spaceGrotesk.variable}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar />
        {children}
      </SidebarProvider>
    </div>
  );
}
