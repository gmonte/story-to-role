"use client";

import { useState } from "react";

import { Plus, Sparkles, Trash2 } from "lucide-react";

import type { VersionView } from "@repo/api/domains/documents/schemas/document-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

import { WorkspaceBody } from "~/domains/workspace/components/workspace-body";
import { WorkspaceSkeleton } from "~/domains/workspace/components/workspace-skeleton";

import { useLibrary, useLibraryDocument } from "../hooks/use-library";
import { useSelectedVersion } from "../hooks/use-selected-version";
import { DeleteDocumentDialog } from "./delete-document-dialog";
import { DocumentAgent } from "./document-agent";
import { DocumentAgentProvider } from "./document-agent-context";
import {
  DocumentSidePanel,
  useVersionRowLabel,
  VersionsBlock,
} from "./document-side-panel";
import { DocumentWorkspace } from "./document-workspace";
import { GenerationProgress } from "./documents-panel";
import { HeadlineOptions, LanguageLevels } from "./linkedin-choices";
import { LinkedinDialog } from "./linkedin-dialog";
import { LinkedinIndex } from "./linkedin-index";
import { LinkedinStepCard, LinkedinStepList } from "./linkedin-steps";
import {
  type LinkedinStepKey,
  linkedinSteps,
  openStep,
} from "../utils/linkedin-steps";

/** The user's one LinkedIn document, found among their documents. */
function useLinkedinDocumentId() {
  const library = useLibrary();
  return {
    loaded: !!library.data,
    documentId:
      library.data?.find((document) => document.kind === "linkedin")?.id ??
      null,
  };
}

/**
 * The LinkedIn page (resume spec, "LinkedIn"): with no text yet, what it
 * writes and Generate my LinkedIn; then the text in the document
 * workspace, with the versions on the right.
 */
export function LinkedinBody() {
  const { loaded, documentId } = useLinkedinDocumentId();
  if (!loaded) return <WorkspaceSkeleton />;
  if (!documentId) return <LinkedinEmpty />;
  return <LinkedinWorkspace documentId={documentId} />;
}

/** The LinkedIn text in the document workspace, once it has loaded. */
function LinkedinWorkspace({ documentId }: { documentId: string }) {
  const document = useLibraryDocument(documentId);
  if (!document.data) return <WorkspaceSkeleton />;
  return (
    <DocumentAgentProvider>
      <WorkspaceBody
        layoutId="linkedin"
        chat={<LinkedinView documentId={documentId} />}
        panel={<LinkedinPanel documentId={documentId} />}
      />
    </DocumentAgentProvider>
  );
}

function LinkedinEmpty() {
  const t = useTranslation();
  const sections = [
    t.formatMessage({ defaultMessage: "Headline options to choose from" }),
    t.formatMessage({ defaultMessage: "About" }),
    t.formatMessage({
      defaultMessage: "Key achievements for each experience and project",
    }),
    t.formatMessage({ defaultMessage: "Education" }),
    t.formatMessage({ defaultMessage: "Licenses & certifications" }),
    t.formatMessage({ defaultMessage: "Languages, on LinkedIn's scale" }),
  ];
  return (
    <div className="flex flex-1 items-start justify-center overflow-y-auto p-6">
      <div className="bg-card flex w-full max-w-xl flex-col gap-4 rounded-lg border p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">
            {t.formatMessage({ defaultMessage: "Your LinkedIn, written" })}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t.formatMessage({
              defaultMessage:
                "StoryToRole writes your LinkedIn from your published profile, one section at a time, with the same rules as your resumes. You edit it here and copy what you approve; nothing is ever changed on LinkedIn.",
            })}
          </p>
        </div>
        <ul className="text-muted-foreground grid gap-1 text-sm">
          {sections.map((section) => (
            <li key={section} className="flex items-center gap-2">
              <span className="bg-primary size-1.5 rounded-full" />
              {section}
            </li>
          ))}
        </ul>
        <LinkedinDialog
          trigger={
            <Button className="self-start">
              <Sparkles className="text-brand-accent" />
              {t.formatMessage({ defaultMessage: "Create my LinkedIn" })}
            </Button>
          }
        />
      </div>
    </div>
  );
}

/** The text in the workspace; its progress while it is generated. */
function LinkedinView({ documentId }: { documentId: string }) {
  const t = useTranslation();
  const document = useLibraryDocument(documentId);
  const versions = document.data?.versions ?? [];
  const { selected, select } = useSelectedVersion(versions);
  const generation = document.data?.generation;
  const running =
    generation?.status === "pending" || generation?.status === "running";
  const content =
    selected?.content.kind === "linkedin" ? selected.content : null;
  const steps = content ? linkedinSteps(content) : [];
  // Guided until the coverage review judged the text: Finish, or the
  // shortcut that generates everything at once.
  const guided =
    !!content &&
    !selected?.coverage?.review &&
    !(running && generation?.kind === "generate");
  const [chosenStep, setChosenStep] = useState<LinkedinStepKey | null>(null);
  const step =
    chosenStep && steps.some((row) => row.key === chosenStep)
      ? chosenStep
      : openStep(steps);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {running && (
        <div className="p-6">
          <GenerationProgress
            generation={generation}
            title={t.formatMessage({ defaultMessage: "Writing your LinkedIn" })}
          />
        </div>
      )}
      {generation?.status === "failed" && versions.length === 0 && (
        <div className="border-destructive/40 bg-destructive/10 m-6 flex items-center justify-between gap-3 rounded-lg border p-2.5 text-xs">
          <span>
            {t.formatMessage({
              defaultMessage: "The last generation failed. Try again.",
            })}
          </span>
          <LinkedinDialog
            defaultTone={generation.tone}
            trigger={
              <Button size="sm" variant="outline">
                {t.formatMessage({ defaultMessage: "Try again" })}
              </Button>
            }
          />
        </div>
      )}
      {selected?.content.kind === "linkedin" && (
        <DocumentWorkspace
          version={selected}
          versions={versions}
          select={select}
          index={
            guided ? (
              <div className="flex flex-col gap-4">
                <LinkedinStepList
                  steps={steps}
                  current={step}
                  onSelect={setChosenStep}
                />
                <LinkedinStepCard
                  steps={steps}
                  current={step}
                  onSelect={setChosenStep}
                  busy={running}
                />
              </div>
            ) : (
              <LinkedinIndex busy={running} />
            )
          }
          notices={<LinkedinNotices version={selected} />}
        />
      )}
    </div>
  );
}

function LinkedinNotices({ version }: { version: VersionView }) {
  return (
    <>
      <HeadlineOptions />
      <LanguageLevels language={version.language} />
    </>
  );
}

/** The versions: a new one is a generation in another language. */
function LinkedinPanel({ documentId }: { documentId: string }) {
  const t = useTranslation();
  const rowLabel = useVersionRowLabel();
  const document = useLibraryDocument(documentId);
  const versions = document.data?.versions ?? [];
  const { selected, select } = useSelectedVersion(versions);
  if (!document.data || !selected) return null;
  const tone = document.data.generation?.tone;

  return (
    <DocumentSidePanel
      version={selected}
      preview={false}
      agent={
        <DocumentAgent
          documentId={documentId}
          kind="linkedin"
          version={selected}
        />
      }
      versions={
        <VersionsBlock
          document={document.data}
          version={selected}
          select={select}
          label={rowLabel(document.data.kind)}
          newVersion={
            <div className="flex items-center gap-1">
              <LinkedinDialog
                defaultTone={tone}
                trigger={
                  <Button size="sm" variant="ghost">
                    <Plus />
                    {t.formatMessage({ defaultMessage: "New version" })}
                  </Button>
                }
              />
              <DeleteDocumentDialog
                documentId={documentId}
                trigger={
                  <Button
                    size="sm"
                    variant="ghost"
                    title={t.formatMessage({
                      defaultMessage: "Delete document",
                    })}
                  >
                    <Trash2 />
                  </Button>
                }
              />
            </div>
          }
          generateAgain={(version, trigger) => (
            <LinkedinDialog
              defaultLanguage={version.language}
              defaultTone={tone}
              trigger={trigger}
            />
          )}
        />
      }
    />
  );
}
