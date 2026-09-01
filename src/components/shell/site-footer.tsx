import Link from "next/link";
import { BrandMark } from "@/components/shell/brand-mark";

const COLUMNS = [
  {
    heading: "Marketplace",
    links: [
      { label: "Discover games", href: "/discover" },
      { label: "Tickets wanted", href: "/wanted" },
      { label: "List your tickets", href: "/list" },
      { label: "Fan circles", href: "/circles" },
    ],
  },
  {
    heading: "Your account",
    links: [
      { label: "Offers", href: "/offers" },
      { label: "Trades", href: "/trades" },
      { label: "Messages", href: "/messages" },
      { label: "Profile", href: "/profile" },
    ],
  },
  {
    heading: "Trust & safety",
    links: [
      { label: "How protected trades work", href: "/#how-it-works" },
      { label: "Marketplace rules", href: "/marketplace-rules" },
      { label: "Terms of service", href: "/terms" },
      { label: "Privacy policy", href: "/privacy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-[#29404f] bg-[#06111b] text-[#f0eee6]">
      <div className="mx-auto grid max-w-[1500px] grid-cols-2 gap-x-8 gap-y-12 px-6 py-16 sm:grid-cols-4 lg:px-8 lg:py-24">
        <div className="col-span-2 sm:col-span-1">
          <Link href="/">
            <BrandMark />
          </Link>
          <p className="mt-6 max-w-xs text-sm leading-6 text-[#9aa8b0]">
            Trade games, not just tickets. A sports-only marketplace for fans to swap, sell, and
            request tickets with protected transfers.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.heading}>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#84bd3a]">{column.heading}</p>
            <ul className="mt-5 space-y-3">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-sm text-[#9aa8b0] transition-colors hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-[#29404f] px-6 py-7 lg:px-8">
        <p className="mx-auto max-w-[1500px] font-mono text-[10px] leading-5 text-[#7f909b]">
          Ticket transfers happen in the official issuer app. Configured Stripe Connect accounts
          handle protected payments and refundable deposits; GameSwap does not claim issuer verification or escrow.
        </p>
      </div>
    </footer>
  );
}
