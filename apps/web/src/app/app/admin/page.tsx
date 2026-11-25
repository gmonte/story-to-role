import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/** The admin opens on its first tab. */
export default async function AdminPage() {
  await auth.protect();
  redirect("/app/admin/usage");
}
