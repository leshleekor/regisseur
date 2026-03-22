import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import {
  Children,
  isValidElement,
  type ChangeEvent,
  type JSX,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

const EMPTY_VALUE = "__EMPTY_OPTION__";

interface OptionItem {
  disabled?: boolean;
  label: string;
  value: string;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children" | "onChange"> {
  children?: ReactNode;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  placeholder?: string;
}

function toText(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return Children.toArray(value).map(toText).join("");
}

function collectOptions(children: ReactNode): OptionItem[] {
  return Children.toArray(children).flatMap((child) => {
    if (
      !isValidElement<{
        children?: ReactNode;
        disabled?: boolean;
        value?: string | number;
      }>(child)
    ) {
      return [];
    }

    if (child.type === "option") {
      const optionValue = child.props.value ?? "";

      return [
        {
          disabled: child.props.disabled,
          label: toText(child.props.children),
          value: typeof optionValue === "string" ? optionValue : String(optionValue),
        },
      ];
    }

    return [];
  });
}

function encodeValue(value: string): string {
  return value === "" ? EMPTY_VALUE : value;
}

function decodeValue(value: string): string {
  return value === EMPTY_VALUE ? "" : value;
}

export function Select({
  children,
  className,
  disabled,
  onChange,
  placeholder,
  value,
  ...props
}: SelectProps): JSX.Element {
  const options = collectOptions(children);
  const normalizedValue = Array.isArray(value) ? value[0] ?? "" : String(value ?? "");
  const selectedValue = encodeValue(normalizedValue);
  const selectedLabel =
    options.find((option) => option.value === normalizedValue)?.label ?? placeholder;

  return (
    <SelectPrimitive.Root
      disabled={disabled}
      value={selectedValue}
      onValueChange={(nextValue: string) => {
        const resolvedValue = decodeValue(nextValue);
        onChange?.({
          target: { value: resolvedValue },
          currentTarget: { value: resolvedValue },
        } as ChangeEvent<HTMLSelectElement>);
      }}
    >
      <SelectPrimitive.Trigger
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-[color:var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--foreground)] outline-none transition-colors focus:ring-2 focus:ring-[color:var(--accent)]/20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-[color:var(--muted)]",
          className,
        )}
        aria-label={props.name}
      >
        <SelectPrimitive.Value placeholder={selectedLabel ?? "Select"} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 text-[color:var(--muted)]" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          className="z-50 min-w-[8rem] overflow-hidden rounded-md border border-[color:var(--border)] bg-white text-[color:var(--foreground)] shadow-panel"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={`${option.value}:${option.label}`}
                value={encodeValue(option.value)}
                disabled={option.disabled}
                className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-slate-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-4 w-4" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
