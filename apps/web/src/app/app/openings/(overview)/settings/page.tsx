import { auth } from "@clerk/nextjs/server";

import { TrackerSettingsForm } from "~/domains/applications/components/tracker-settings-form";

export default async function OpeningsSettingsPage() {
  await auth.protect();

  return (
    <div className="mx-auto w-full max-w-6xl px-6">
      <TrackerSettingsForm />
    </div>
  );
}
