"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  onChange: (dataUrl: string | null) => void;
  required?: boolean;
  disabled?: boolean;
}

/**
 * Lightweight signature pad. Renders a fixed-aspect canvas the user can
 * draw on with mouse or touch. On every stroke end, exports the canvas to
 * a data URL and calls onChange.
 *
 * The parent decides what to do with the data URL — for forms, we convert
 * it to a Blob, POST to /api/upload, and store the resulting public URL
 * in the form values (same path as image fields).
 */
export function SignaturePad({ onChange, required, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Match canvas backing-store size to its CSS size for crisp lines on
    // high-DPI displays. Doing this once at mount is fine — the form is
    // not resizable.
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
    // White background so the exported PNG isn't transparent.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, []);

  const getPoint = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0] || e.changedTouches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = getPoint(e);
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current || disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const last = lastPointRef.current;
    if (!ctx || !last) return;
    const p = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPointRef.current = p;
  };

  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setHasContent(true);
    onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasContent(false);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="relative border border-border rounded-md bg-white">
        <canvas
          ref={canvasRef}
          className="w-full touch-none rounded-md cursor-crosshair"
          style={{ height: 140 }}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        {!hasContent && (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-muted pointer-events-none">
            {required ? "Sign here (required)" : "Sign here"}
          </span>
        )}
      </div>
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted">{hasContent ? "✓ Captured" : ""}</span>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasContent}
          className="text-xs text-muted hover:text-foreground disabled:opacity-30"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
