import { auth } from "@clerk/nextjs/server";

export default async function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await auth.protect();
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
