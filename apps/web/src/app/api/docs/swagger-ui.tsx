"use client";

import "swagger-ui-dist/swagger-ui.css";

import { SwaggerUIBundle } from "swagger-ui-dist";
import type { OpenAPIObject } from "trpc-to-openapi";

import { getBaseUrl } from "@repo/common/utils/get-base-url";

export function SwaggerUi({ spec }: { spec: OpenAPIObject }) {
  const clientSpec = {
    ...spec,
    servers: [{ url: `${getBaseUrl()}/api/rest` }],
  };

  return (
    <div
      ref={(el) => {
        if (!el) return;
        SwaggerUIBundle({
          spec: clientSpec,
          domNode: el,
        });
      }}
    />
  );
}
