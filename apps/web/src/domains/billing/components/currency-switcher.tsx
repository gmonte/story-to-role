"use client";

import { useTransition } from "react";

import { useRouter } from "next/navigation";

import type { Currency } from "@repo/api/domains/billing/schemas/billing";
import { useTranslation } from "@repo/intl/use-translation";
import { Tabs, TabsList, TabsTrigger } from "@repo/web/components/ui/tabs";

import { setCurrencyAction } from "../actions/set-currency-action";

/**
 * BRL or USD for prices and Checkout, whatever the interface language
 * (billing spec, "Currencies").
 */
export function CurrencySwitcher({ currency }: { currency: Currency }) {
  const t = useTranslation();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function change(next: string) {
    startTransition(async () => {
      await setCurrencyAction(next as Currency);
      router.refresh();
    });
  }

  return (
    <Tabs value={currency} onValueChange={change}>
      <TabsList
        aria-label={t.formatMessage({ defaultMessage: "Currency" })}
        aria-busy={isPending}
      >
        <TabsTrigger value="brl" disabled={isPending}>
          {t.formatMessage({ defaultMessage: "BRL (R$)" })}
        </TabsTrigger>
        <TabsTrigger value="usd" disabled={isPending}>
          {t.formatMessage({ defaultMessage: "USD (US$)" })}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
