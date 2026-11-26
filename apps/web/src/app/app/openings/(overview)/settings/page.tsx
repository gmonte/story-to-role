import { auth } from "@clerk/nextjs/server";

import { TrackerSettingsForm } from "~/domains/applications/components/tracker-settings-form";

export default async function OpeningsSettingsPage() {
  await auth.protect();

  return (
    <div className="w-full max-w-2xl px-6">
      <TrackerSettingsForm />
    </div>
  );
}
