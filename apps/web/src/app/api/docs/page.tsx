import { auth } from "@clerk/nextjs/server";
import { generateOpenApiDocument } from "trpc-to-openapi";

import packageJson from "@repo/api/package.json";
import { appRouter } from "@repo/api/router";
import { getBaseUrl } from "@repo/common/utils/get-base-url";

import { SwaggerUi } from "./swagger-ui";

export default async function DocsPage() {
  await auth.protect();
  const openApiDocument = generateOpenApiDocument(appRouter, {
    title: "StoryToRole API",
    version: packageJson.version,
    baseUrl: `${getBaseUrl()}/api/rest`,
  });

  return <SwaggerUi spec={openApiDocument} />;
}
