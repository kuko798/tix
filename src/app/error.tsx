"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) { useEffect(() => { console.error(JSON.stringify({ event: "ui.route_error", digest: error.digest })); }, [error]); return <div className="mx-auto max-w-xl px-4 py-24 sm:px-6"><h1 className="font-display text-4xl">This page could not load</h1><p className="mt-4 text-sm text-muted-foreground">Your data was not changed. Check your connection, then try again.</p><Button className="mt-8" onClick={reset}>Try again</Button></div>; }
