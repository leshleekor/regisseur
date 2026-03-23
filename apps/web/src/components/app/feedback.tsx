import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type PropsWithChildren,
} from "react";

import { Button, Card } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

type ToastTone = "accent" | "success" | "warning" | "danger" | "info";

interface ToastEntry {
  id: string;
  title?: string;
  description: string;
  tone: ToastTone;
  durationMs: number;
}

interface ToastContextValue {
  pushToast: (input: {
    title?: string;
    description: string;
    tone?: ToastTone;
    durationMs?: number;
  }) => void;
}

interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel?: string;
  confirmTone?: ToastTone;
}

interface ConfirmContextValue {
  confirm: (request: ConfirmRequest) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function FeedbackProvider({ children }: PropsWithChildren): JSX.Element {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const confirmResolverRef = useRef<((result: boolean) => void) | null>(null);

  const dismissToast = useCallback((toastId: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }, []);

  const pushToast = useCallback<ToastContextValue["pushToast"]>((input) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setToasts((current) => [
      ...current,
      {
        id,
        title: input.title,
        description: input.description,
        tone: input.tone ?? "accent",
        durationMs: input.durationMs ?? 4200,
      },
    ]);
  }, []);

  useEffect(() => {
    const timers = toasts.map((toast) =>
      window.setTimeout(() => dismissToast(toast.id), toast.durationMs),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [dismissToast, toasts]);

  const confirm = useCallback<ConfirmContextValue["confirm"]>((request) => {
    if (confirmResolverRef.current) {
      confirmResolverRef.current(false);
    }

    setConfirmRequest(request);

    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
    });
  }, []);

  const resolveConfirm = useCallback((result: boolean) => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmRequest(null);
    resolver?.(result);
  }, []);

  const toastValue = useMemo<ToastContextValue>(
    () => ({
      pushToast,
    }),
    [pushToast],
  );

  const confirmValue = useMemo<ConfirmContextValue>(
    () => ({
      confirm,
    }),
    [confirm],
  );

  return (
    <ToastContext.Provider value={toastValue}>
      <ConfirmContext.Provider value={confirmValue}>
        {children}
        <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-3">
          {toasts.map((toast) => (
            <Card
              key={toast.id}
              className={cn(
                "pointer-events-auto border-l-4 p-4 shadow-lg",
                toastToneClassName(toast.tone),
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  {toast.title ? <div className="font-semibold">{toast.title}</div> : null}
                  <div className="text-sm text-[color:var(--foreground)]">{toast.description}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto px-2 py-1"
                  onClick={() => dismissToast(toast.id)}
                >
                  Dismiss
                </Button>
              </div>
            </Card>
          ))}
        </div>
        {confirmRequest ? (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 px-4">
            <Card className="w-full max-w-lg space-y-5 p-6 shadow-2xl">
              <div className="space-y-2">
                <h2 className="font-sans text-2xl font-bold">{confirmRequest.title}</h2>
                <p className="whitespace-pre-wrap text-sm text-[color:var(--muted)]">
                  {confirmRequest.description}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                <Button variant="secondary" onClick={() => resolveConfirm(false)}>
                  Cancel
                </Button>
                <Button
                  variant={confirmRequest.confirmTone === "danger" ? "danger" : "default"}
                  onClick={() => resolveConfirm(true)}
                >
                  {confirmRequest.confirmLabel ?? "Confirm"}
                </Button>
              </div>
            </Card>
          </div>
        ) : null}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within FeedbackProvider");
  }

  return context;
}

export function useConfirmDialog(): ConfirmContextValue["confirm"] {
  const context = useContext(ConfirmContext);

  if (!context) {
    throw new Error("useConfirmDialog must be used within FeedbackProvider");
  }

  return context.confirm;
}

function toastToneClassName(tone: ToastTone): string {
  switch (tone) {
    case "success":
      return "border-[color:var(--success)]";
    case "warning":
      return "border-[color:var(--warning)]";
    case "danger":
      return "border-[color:var(--danger)]";
    case "info":
      return "border-[color:var(--info)]";
    default:
      return "border-[color:var(--accent)]";
  }
}
