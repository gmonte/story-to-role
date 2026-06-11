process.env.SKIP_ENV_VALIDATION = "1";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

vi.mock("server-only", () => ({}));
