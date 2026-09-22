"use client";

import { useRef, useState } from "react";

// Pure geometry — separated from the stateful hook below so it's testable
// without a React test renderer (no @testing-library/react or similar
// exists in this codebase, and adding one just for this would be a bigger
// dependency addition than the swipe feature itself warrants).
export function clampTranslate(delta: number, max: number): number {
  return Math.max(-max, Math.min(max, delta));
}

export function resolveSwipeDirection(translateX: number, threshold: number): "left" | "right" | null {
  if (translateX <= -threshold) return "left";
  if (translateX >= threshold) return "right";
  return null;
}

interface UseSwipeActionOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  // Caps how far the row can be dragged visually, so a fast/long drag
  // doesn't fling the row off-screen before the pointer is released.
  maxTranslate?: number;
}

interface UseSwipeActionResult {
  translateX: number;
  dragging: boolean;
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
}

// Hand-rolled pointer-event swipe detection — no gesture library exists
// (or is added) in this codebase; see app/watchlist.tsx for how this is
// used as a progressive enhancement alongside (never replacing) the
// existing tap Buy/Sell buttons, since swipe gestures can't be verified
// without real touch hardware in this environment.
export function useSwipeAction({
  onSwipeLeft,
  onSwipeRight,
  threshold = 80,
  maxTranslate = 120,
}: UseSwipeActionOptions): UseSwipeActionResult {
  const [translateX, setTranslateX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef<number | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    startXRef.current = e.clientX;
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (startXRef.current === null) return;
    setTranslateX(clampTranslate(e.clientX - startXRef.current, maxTranslate));
  }

  function reset() {
    startXRef.current = null;
    setDragging(false);
    setTranslateX(0);
  }

  function onPointerUp() {
    const direction = resolveSwipeDirection(translateX, threshold);
    if (direction === "left") onSwipeLeft?.();
    else if (direction === "right") onSwipeRight?.();
    reset();
  }

  return {
    translateX,
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: reset,
    },
  };
}
