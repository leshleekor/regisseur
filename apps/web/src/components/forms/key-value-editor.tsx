import type { JSX } from "react";
import { Trash2 } from "lucide-react";

import { Button, Input, Label } from "../ui/primitives";

export function KeyValueEditor({
  label,
  value,
  onChange,
  keyPlaceholder = "key",
  valuePlaceholder = "value",
}: {
  label: string;
  value: Record<string, string>;
  onChange: (nextValue: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}): JSX.Element {
  const entries = Object.entries(value);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            const nextKey = `key_${entries.length + 1}`;
            onChange({
              ...value,
              [nextKey]: "",
            });
          }}
        >
          Add
        </Button>
      </div>
      <div className="space-y-2">
        {entries.length === 0 ? (
          <div className="rounded-md border border-dashed border-[color:var(--border)] px-3 py-4 text-sm text-[color:var(--muted)]">
            No variables yet.
          </div>
        ) : null}
        {entries.map(([entryKey, entryValue]) => (
          <div key={entryKey} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <Input
              placeholder={keyPlaceholder}
              value={entryKey}
              onChange={(event) => {
                const nextKey = event.target.value;
                const nextValue = { ...value };
                delete nextValue[entryKey];
                nextValue[nextKey] = entryValue;
                onChange(nextValue);
              }}
            />
            <Input
              placeholder={valuePlaceholder}
              value={entryValue}
              onChange={(event) =>
                onChange({
                  ...value,
                  [entryKey]: event.target.value,
                })
              }
            />
            <Button
              type="button"
              variant="ghost"
              className="justify-center"
              onClick={() => {
                const nextValue = { ...value };
                delete nextValue[entryKey];
                onChange(nextValue);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
