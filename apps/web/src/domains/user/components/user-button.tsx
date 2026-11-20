"use client";

import { UserButton as ClerkUserButton, useUser } from "@clerk/nextjs";
import { Coins, ShieldCheck } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Skeleton } from "@repo/web/components/ui/skeleton";

/**
 * Account settings live in Clerk's own profile modal; StoryToRole's own
 * (plan, credits and the user's key; privacy and data) are linked from it.
 */
export function UserButton() {
  const t = useTranslation();
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return (
      <div className="flex min-h-12 items-center gap-3 px-2">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-3 flex-1" />
      </div>
    );
  }

  if (!isSignedIn) return null;

  return (
    <ClerkUserButton
      showName
      userProfileMode="modal"
      userProfileProps={{
        appearance: {
          elements: {
            // A long label of ours (“Plan, credits and your key”) wraps:
            // left-aligned with its icon on the first line, like Clerk's.
            navbarButton: "justify-start! items-start! text-left!",
            navbarButtonIcon: "mt-0.5! shrink-0!",
          },
        },
      }}
      appearance={{
        elements: {
          rootBox: "flex-1 w-full!",
          userButtonTrigger:
            "w-full! rounded-md! px-2! py-2! hover:bg-sidebar-accent!",
          userButtonBox: "flex! flex-row-reverse! justify-end! gap-3! w-full!",
          userButtonAvatarBox: "size-8!",
          userButtonOuterIdentifier:
            "text-sm! text-sidebar-foreground! truncate! group-data-[collapsible=icon]:hidden",
        },
      }}
    >
      <ClerkUserButton.UserProfilePage label="account" />
      <ClerkUserButton.UserProfileLink
        label={t.formatMessage({
          defaultMessage: "Plan, credits and your key",
        })}
        url="/app/billing"
        labelIcon={<Coins className="size-4" />}
      />
      <ClerkUserButton.UserProfileLink
        label={t.formatMessage({ defaultMessage: "Privacy and data" })}
        url="/app/account"
        labelIcon={<ShieldCheck className="size-4" />}
      />
      <ClerkUserButton.UserProfilePage label="security" />
    </ClerkUserButton>
  );
}
