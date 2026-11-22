import { auth } from "@clerk/nextjs/server";

import { getTranslation } from "@repo/intl/get-translation";

import { LibraryDocumentBody } from "~/domains/documents/components/library-document-view";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function LibraryDocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  await auth.protect();
  const { documentId } = await params;
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "Library" })}
      body={<LibraryDocumentBody documentId={documentId} />}
    />
  );
}
