"use client";

import { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  show: boolean;
  onHide: () => void;
}

export function Toast({ message, show, onHide }: ToastProps) {
  useEffect(() => {
    if (show) {
      const t = setTimeout(onHide, 2000);
      return () => clearTimeout(t);
    }
  }, [show, onHide]);

  if (!show) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-toast">
      <div className="bg-surface-2 border border-border text-foreground text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
        <svg className="w-4 h-4 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        {message}
      </div>
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState({ show: false, message: "" });
  const showToast = (message: string) => setToast({ show: true, message });
  const hideToast = () => setToast({ show: false, message: "" });
  return { toast, showToast, hideToast };
}
