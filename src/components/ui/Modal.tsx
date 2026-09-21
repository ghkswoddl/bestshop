"use client";

import { useEffect, useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CloseIcon } from "./icons";

export type ModalSize = "default" | "large";

const SIZE: Record<ModalSize, string> = {
  default: "max-w-modal",
  large: "max-w-modal-lg",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  size?: ModalSize;
  footer?: ReactNode;
  children: ReactNode;
}

export function Modal({ open, onClose, title, size = "default", footer, children }: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-lg">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative flex max-h-[90vh] w-full flex-col rounded-modal bg-white shadow-modal",
          SIZE[size],
        )}
      >
        <header className="flex items-center justify-between gap-md border-b border-gray-200 px-xl py-lg">
          <h2 id={titleId} className="text-h2 text-gray-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-10 w-10 items-center justify-center rounded-control text-gray-700 hover:bg-gray-100"
          >
            <CloseIcon />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-xl py-lg">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-md border-t border-gray-200 px-xl py-lg">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
