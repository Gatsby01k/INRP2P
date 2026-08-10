"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

function clock(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export function OrderExpiry({ expiresAt, initialSeconds }: { expiresAt: string; initialSeconds: number }) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(initialSeconds);
  const refreshed = useRef(false);

  useEffect(() => {
    const update = () => {
      const next = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1_000));
      setSeconds(next);
      if (next === 0 && !refreshed.current) {
        refreshed.current = true;
        router.refresh();
      }
    };
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [expiresAt, router]);

  return (
    <span className={seconds <= 60 ? "font-mono text-xs font-semibold tabular-nums text-rose-600" : "font-mono text-xs font-semibold tabular-nums text-slate-700"}>
      {seconds > 0 ? clock(seconds) : "Expired"}
    </span>
  );
}
