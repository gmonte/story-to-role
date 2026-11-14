import { Space_Grotesk } from "next/font/google";
import { cookies } from "next/headers";

import { SidebarProvider } from "@repo/web/components/ui/sidebar";

import { AppSidebar } from "~/domains/workspace/components/app-sidebar";

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
