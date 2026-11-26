import { auth } from "@clerk/nextjs/server";

import { TrackerMetricsPanel } from "~/domains/applications/components/tracker-metrics-panel";

export default async function OpeningsMetricsPage() {
  await auth.protect();

  return (
    <div className="w-full px-6">
      <TrackerMetricsPanel />
    </div>
  );
}
