"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (target: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export function TurnstileField({ resetKey = 0 }: { resetKey?: number }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const targetRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);

  const renderWidget = useCallback(() => {
    if (!siteKey || !targetRef.current || !window.turnstile || widgetRef.current) return;
    widgetRef.current = window.turnstile.render(targetRef.current, {
      sitekey: siteKey,
      theme: "light",
      appearance: "interaction-only",
      retry: "auto",
      "refresh-expired": "auto",
      "refresh-timeout": "auto",
    });
  }, [siteKey]);

  useEffect(() => {
    if (widgetRef.current && window.turnstile) window.turnstile.reset(widgetRef.current);
  }, [resetKey]);

  useEffect(() => () => {
    if (widgetRef.current && window.turnstile) window.turnstile.remove(widgetRef.current);
    widgetRef.current = null;
  }, []);

  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={renderWidget} onReady={renderWidget} />
      <div ref={targetRef} className="min-h-[1px]" />
    </>
  );
}
