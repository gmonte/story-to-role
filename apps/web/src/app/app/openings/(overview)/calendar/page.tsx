import { Suspense } from "react";

import { auth } from "@clerk/nextjs/server";

import { OpeningsCalendar } from "~/domains/applications/components/openings-calendar";

export default async function OpeningsCalendarPage() {
  await auth.protect();

  return (
    <Suspense>
      <OpeningsCalendar />
    </Suspense>
  );
}
