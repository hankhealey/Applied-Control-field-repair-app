"use client";

import { useEffect, useRef } from "react";
import { Button } from "./Button";

interface ConfirmSheetProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: "danger" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        aria-hidden="true"
        onClick={onCancel}
        style={{ backdropFilter: "blur(2px)" }}
      />

      {/* Sheet — slides up on mobile, centered on desktop */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={message ? "confirm-message" : undefined}
        className="fixed z-50 inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4"
      >
        <div
          className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl"
          style={{ background: "var(--bg-card)" }}
        >
          <h2
            id="confirm-title"
            className="text-base font-semibold mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </h2>
          {message && (
            <p
              id="confirm-message"
              className="text-sm mb-5"
              style={{ color: "var(--text-secondary)" }}
            >
              {message}
            </p>
          )}
          {!message && <div className="mb-5" />}

          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <Button
              ref={cancelRef as React.Ref<HTMLButtonElement>}
              variant="secondary"
              size="md"
              className="flex-1"
              onClick={onCancel}
            >
              {cancelLabel}
            </Button>
            <Button
              variant={variant}
              size="md"
              className="flex-1"
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
