import { buttonVariants } from "@repo/web/components/ui/button";
import { cn } from "@repo/web/lib/utils";

/**
 * Accept and Reject look the same everywhere (ADR 0012 mockups): Accept is
 * the primary button, Reject the outline one, both 30px tall with a 15px
 * icon and 13px text. React buttons take `decisionButton` as a class; the
 * editor's own DOM widgets take the full classes and icons below.
 */
export const decisionButton =
  "h-[30px] gap-1.5 px-2.5 text-[13px] [&_svg]:size-[15px]";

export const acceptButtonClass = cn(buttonVariants(), decisionButton);
export const rejectButtonClass = cn(
  buttonVariants({ variant: "outline" }),
  decisionButton
);

// lucide's Check and X, for the widgets built outside React.
const icon = (paths: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
export const checkIcon = icon('<path d="M20 6 9 17l-5-5"/>');
export const xIcon = icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
