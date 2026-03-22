import { useMemo, type JSX } from "react";

import { Input, Label, Select, Textarea } from "../ui/primitives";
import { KeyValueEditor } from "./key-value-editor";

type DynamicPromptMode = "fixed" | "delegate" | "none";

interface PromptPayload {
  promptTemplate?: string;
  systemPrompt?: string;
  model?: string;
  variables?: Record<string, string>;
  dynamicPromptPolicy?: {
    mode?: DynamicPromptMode;
  };
  [key: string]: unknown;
}

export function PromptEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (nextValue: Record<string, unknown>) => void;
}): JSX.Element {
  const payload = value as PromptPayload;
  const variables = useMemo(
    () => (isStringRecord(payload.variables) ? payload.variables : {}),
    [payload.variables],
  );
  const promptPreview = Object.entries(variables).reduce((preview, [key, entryValue]) => {
    return preview.replaceAll(`{{${key}}}`, entryValue);
  }, payload.promptTemplate ?? "");

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Model</Label>
          <Input
            value={payload.model ?? ""}
            placeholder="gpt-5"
            onChange={(event) =>
              onChange({
                ...value,
                model: event.target.value,
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Dynamic Prompt Policy</Label>
          <Select
            value={payload.dynamicPromptPolicy?.mode ?? "fixed"}
            onChange={(event) =>
              onChange({
                ...value,
                dynamicPromptPolicy: {
                  mode: event.target.value as DynamicPromptMode,
                },
              })
            }
          >
            <option value="fixed">fixed</option>
            <option value="delegate">delegate</option>
            <option value="none">none</option>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>System Prompt</Label>
        <Textarea
          value={payload.systemPrompt ?? ""}
          onChange={(event) =>
            onChange({
              ...value,
              systemPrompt: event.target.value,
            })
          }
        />
      </div>

      <div className="space-y-2">
        <Label>Prompt Template</Label>
        <Textarea
          className="min-h-40"
          value={payload.promptTemplate ?? ""}
          onChange={(event) =>
            onChange({
              ...value,
              promptTemplate: event.target.value,
            })
          }
        />
      </div>

      <KeyValueEditor
        label="Variables"
        value={variables}
        onChange={(nextVariables) =>
          onChange({
            ...value,
            variables: nextVariables,
          })
        }
        keyPlaceholder="variableName"
      />

      <div className="space-y-2 rounded-md border border-[color:var(--border)] bg-white p-4">
        <Label>Prompt Preview</Label>
        <pre className="whitespace-pre-wrap text-sm text-[color:var(--foreground)]">
          {promptPreview || "Prompt preview will appear here."}
        </pre>
      </div>
    </div>
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}
