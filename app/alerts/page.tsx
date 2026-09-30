"use client";

import { useState } from "react";
import { AppShellNav } from "../app-shell-nav";
import { AlertsPanel } from "./alerts-panel";
import { PushSubscribeButton } from "../push-subscribe-button";
import { PushSubscriptionsList } from "../push-subscriptions-list";
import { Collapsible } from "../collapsible";

export default function AlertsPage() {
  const [refreshSignal, setRefreshSignal] = useState(0);

  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-6 p-6 pb-24 sm:p-12">
      <AppShellNav />
      <main className="contents">
        <AlertsPanel />
        <div className="w-full max-w-2xl">
          <Collapsible title="Notification settings" hint="push on this device">
            <div className="flex flex-col gap-3">
              <PushSubscribeButton onSubscribed={() => setRefreshSignal((v) => v + 1)} />
              <PushSubscriptionsList refreshSignal={refreshSignal} />
            </div>
          </Collapsible>
        </div>
      </main>
    </div>
  );
}
