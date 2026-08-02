"use client";

import { useState } from "react";
import { enablePushNotifications } from "@/lib/push/subscribe-client";

interface PushSubscribeButtonProps {
  onSubscribed?: () => void;
}

export function PushSubscribeButton({ onSubscribed }: PushSubscribeButtonProps = {}) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setStatus("loading");
    setError(null);
    try {
      await enablePushNotifications();
      setStatus("done");
      onSubscribed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable notifications");
      setStatus("error");
    }
  }

  if (status === "done") {
    return <p className="text-sm text-green-600">Push notifications enabled on this device.</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={status === "loading"}
        className="btn-primary text-sm w-fit disabled:opacity-40"
      >
        {status === "loading" ? "Enabling…" : "Enable push notifications on this device"}
      </button>
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
