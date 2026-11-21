"use client";

import { useTranslation } from "@repo/intl/use-translation";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/web/components/ui/tabs";

import { CourtesyGrants } from "./courtesy-grants";
import { PlatformUsageView } from "./platform-usage-view";

/** The admin page: everyone's AI usage, and the courtesy grants. */
export function AdminView() {
  const t = useTranslation();
  return (
    <Tabs defaultValue="usage" className="min-h-0 flex-1 gap-0">
      <TabsList className="mx-6 mt-4">
        <TabsTrigger value="usage">
          {t.formatMessage({ defaultMessage: "Usage" })}
        </TabsTrigger>
        <TabsTrigger value="courtesy">
          {t.formatMessage({ defaultMessage: "Courtesy grants" })}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="usage" className="flex min-h-0 flex-1">
        <PlatformUsageView />
      </TabsContent>
      <TabsContent value="courtesy" className="flex min-h-0 flex-1">
        <CourtesyGrants />
      </TabsContent>
    </Tabs>
  );
}
