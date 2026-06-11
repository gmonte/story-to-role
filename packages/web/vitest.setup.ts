process.env.SKIP_ENV_VALIDATION = "1";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
