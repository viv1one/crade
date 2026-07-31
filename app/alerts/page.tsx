"use client";

import { useState } from "react";
import { AppNav } from "../app-nav";
import { AlertsPanel } from "./alerts-panel";
import { PushSubscribeButton } from "../push-subscribe-button";
import { PushSubscriptionsList } from "../push-subscriptions-list";

export default function AlertsPage() {
  const [refreshSignal, setRefreshSignal] = useState(0);

  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-16 p-8 sm:p-20">
      <AppNav />
      <main className="contents">
        <div className="w-full max-w-2xl flex flex-col gap-3">
          <PushSubscribeButton onSubscribed={() => setRefreshSignal((v) => v + 1)} />
          <PushSubscriptionsList refreshSignal={refreshSignal} />
        </div>
        <AlertsPanel />
      </main>
    </div>
  );
}
