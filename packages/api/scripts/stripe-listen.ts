/**
 * Forwards the sandbox's webhook events to the local app (billing spec:
 * `stripe listen` forwards every event by default, so this passes the same
 * events the deployed destinations subscribe to). Through lerna:
 *
 *   pnpm stripe:listen
 */
import { spawn } from "node:child_process";

import { stripeEvents } from "../src/domains/billing/billing-catalog";

const child = spawn(
  "stripe",
  [
    "listen",
    "--forward-to",
    "localhost:3000/api/webhooks/stripe",
    "--events",
    stripeEvents.join(","),
  ],
  { stdio: "inherit" }
);
child.on("exit", (code) => process.exit(code ?? 0));
