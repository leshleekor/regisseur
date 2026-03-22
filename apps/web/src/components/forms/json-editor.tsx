import { useEffect, useState, type JSX } from "react";

import { asPrettyJson } from "@/lib/utils";

import { Label, Textarea } from "../ui/primitives";

export function JsonEditor<TValue extends object>({
  label,
  value,
  onChange,
  minHeightClassName = "min-h-56",
}: {
  label: string;
  value: TValue;
  onChange: (nextValue: TValue) => void;
  minHeightClassName?: string;
}): JSX.Element {
  const [rawValue, setRawValue] = useState(() => asPrettyJson(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRawValue(asPrettyJson(value));
    setError(null);
  }, [value]);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea
        className={minHeightClassName + " font-mono text-xs"}
        value={rawValue}
        onChange={(event) => {
          const nextRaw = event.target.value;
          setRawValue(nextRaw);

          try {
            const parsed = JSON.parse(nextRaw) as TValue;
            setError(null);
            onChange(parsed);
          } catch (parseError) {
            setError(parseError instanceof Error ? parseError.message : "Invalid JSON");
          }
        }}
      />
      {error ? <p className="text-xs text-[color:var(--danger)]">{error}</p> : null}
    </div>
  );
}
