import { redirect } from "next/navigation";

/** The admin opens on its first tab. */
export default function AdminPage() {
  redirect("/app/admin/usage");
}
