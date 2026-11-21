"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";

import type {
  CheckoutProduct,
  Currency,
} from "@repo/api/domains/billing/schemas/billing";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { Input } from "@repo/web/components/ui/input";
import { Label } from "@repo/web/components/ui/label";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

/**
 * The own-key subscription's offer (billing spec, "Plans and AI funding"):
 * the key comes first, checked before Checkout opens, then monthly or
 * annual. From the credit subscription it is the switch.
 */
export function OwnKeyOffer({
  title,
  description,
  price,
  currency,
}: {
  title: string;
  description: string;
  price: (product: CheckoutProduct) => string;
  currency: Currency;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const [apiKey, setApiKey] = useState("");
  const checkout = useMutation(
    trpc.billing.startCheckout.mutationOptions({
      onSuccess: ({ url }) => window.location.assign(url),
      onError: (error) =>
        toast.error(
          error.data?.aiKey === "refused"
            ? t.formatMessage({
                defaultMessage:
                  "Anthropic refused this key. Check it and try again.",
              })
            : error.message
        ),
    })
  );
  const ready = apiKey.trim().length >= 20 && !checkout.isPending;
  const subscribe = (product: CheckoutProduct) =>
    checkout.mutate({ product, apiKey: apiKey.trim(), currency });

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Badge variant="outline" className="gap-1">
          <BadgeCheck className="size-3.5" />
          {t.formatMessage({ defaultMessage: "Anthropic · certified" })}
        </Badge>
      </div>
      <p className="text-muted-foreground">{description}</p>
      <div className="bg-card flex flex-col gap-3 rounded-lg border p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="own-key-offer">
            {t.formatMessage({ defaultMessage: "Anthropic API key" })}
          </Label>
          <Input
            id="own-key-offer"
            type="password"
            autoComplete="off"
            placeholder="sk-ant-…"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <span className="text-muted-foreground text-xs">
            {t.formatMessage({
              defaultMessage:
                "We check the key with Anthropic before payment. A key from a Console organization linked to Claude Max or Team uses that plan’s monthly API credits.",
            })}
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="flex-1"
            disabled={!ready}
            onClick={() => subscribe("own_key_monthly")}
          >
            {t.formatMessage(
              { defaultMessage: "{price} a month" },
              { price: price("own_key_monthly") }
            )}
          </Button>
          <Button
            className="flex-1"
            variant="outline"
            disabled={!ready}
            onClick={() => subscribe("own_key_annual")}
          >
            {t.formatMessage(
              { defaultMessage: "{price} a year" },
              { price: price("own_key_annual") }
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}
