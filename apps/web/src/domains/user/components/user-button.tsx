"use client";

import { UserButton as ClerkUserButton, useUser } from "@clerk/nextjs";
import { Coins, KeyRound } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Skeleton } from "@repo/web/components/ui/skeleton";

import { ProfilePagePlaceholder } from "./profile-page-placeholder";

/**
 * Account settings live in Clerk's own profile modal; StoryToRole's sections
 * (plan and credits, bring-your-own keys) are pages inside it.
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
      <ClerkUserButton.UserProfilePage
        label={t.formatMessage({ defaultMessage: "Plan and credits" })}
        url="plan"
        labelIcon={<Coins className="size-4" />}
      >
        <ProfilePagePlaceholder
          title={t.formatMessage({ defaultMessage: "Plan and credits" })}
          description={t.formatMessage({
            defaultMessage:
              "Your plan, your credit balance and credit packs will appear here.",
          })}
        />
      </ClerkUserButton.UserProfilePage>
      <ClerkUserButton.UserProfilePage
        label={t.formatMessage({ defaultMessage: "Your AI keys" })}
        url="keys"
        labelIcon={<KeyRound className="size-4" />}
      >
        <ProfilePagePlaceholder
          title={t.formatMessage({ defaultMessage: "Your AI keys" })}
          description={t.formatMessage({
            defaultMessage:
              "Bring your own key from a certified provider to pay for AI with it instead of credits.",
          })}
        />
      </ClerkUserButton.UserProfilePage>
      <ClerkUserButton.UserProfilePage label="security" />
    </ClerkUserButton>
  );
}
