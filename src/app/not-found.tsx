import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() { return <div className="mx-auto max-w-xl px-4 py-24 sm:px-6"><p className="tabular text-xs text-muted-foreground">404</p><h1 className="mt-3 font-display text-4xl">That page is not on the board</h1><p className="mt-4 text-sm leading-relaxed text-muted-foreground">The listing may have expired, the offer may have been cancelled, or the address may be wrong.</p><Button asChild className="mt-8"><Link href="/discover">Browse listings</Link></Button></div>; }
