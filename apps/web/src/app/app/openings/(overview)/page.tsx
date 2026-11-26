import { Suspense } from "react";

import { auth } from "@clerk/nextjs/server";

import { TrackerView } from "~/domains/applications/components/tracker-view";

export default async function OpeningsTrackingPage() {
  await auth.protect();

  return (
    <Suspense>
      <TrackerView />
    </Suspense>
  );
}
