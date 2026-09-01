import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CalendarSearch, ListPlus, Megaphone, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SwapLine } from "@/components/brand/swap-line";
import { Reveal } from "@/components/motion/reveal";
import { GameRail } from "@/components/landing/game-rail";
import { ProcessSteps } from "@/components/landing/process-steps";
import { VerificationGrid } from "@/components/landing/verification-grid";
import { listUpcomingEvents } from "@/lib/server/catalog";
import { queryListings, queryWantedRequests } from "@/lib/queries";

export async function ProductionHome() {
  const [events, listings, wanted] = await Promise.all([
    listUpcomingEvents(),
    queryListings(),
    queryWantedRequests(),
  ]);
  const marketplaceEmpty = listings.length === 0 && wanted.length === 0;

  return (
    <div className="overflow-hidden">
      <section className="relative min-h-[calc(100dvh-4rem)] bg-[#06111b] text-[#f0eee6] lg:min-h-[calc(100dvh-4.5rem)]">
        <div className="absolute inset-y-0 right-0 w-full lg:w-[62%]">
          <Image src="/images/hero-stadium.jpg" alt="Empty stadium seats overlooking a lit football field" fill priority sizes="(min-width: 1024px) 62vw, 100vw" className="object-cover object-center" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#06111b_0%,rgba(6,17,27,.78)_22%,rgba(6,17,27,.12)_78%),linear-gradient(0deg,#06111b_0%,transparent_45%)]" />
        </div>

        <div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] max-w-[1500px] flex-col justify-between px-4 pb-24 pt-8 sm:px-6 lg:min-h-[calc(100dvh-4.5rem)] lg:px-8 lg:py-12">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#84bd3a]">Fan to fan / Game access</p>
            <p className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-white/60 sm:block">Protected exchange / Official transfer</p>
          </div>

          <div className="max-w-4xl py-20 lg:py-24">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-white/65">The sports ticket exchange</p>
            <h1 className="font-display mt-5 max-w-[10ch] text-[4.5rem] uppercase leading-[0.79] tracking-[-0.055em] text-balance sm:text-8xl lg:text-[8.75rem]">Keep the seat in play.</h1>
            <p className="mt-8 max-w-md text-base leading-7 text-white/72 sm:text-lg">Trade unused seats for the games you actually want. Sell directly when a swap does not fit.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg" className="min-w-44"><Link href="/discover">Enter marketplace <ArrowUpRight aria-hidden /></Link></Button>
              <Button asChild size="lg" variant="outline" className="border-white/35 bg-transparent text-white hover:bg-white hover:text-[#06111b]"><Link href="/list">List your tickets</Link></Button>
            </div>
          </div>

          <div className="border-t border-white/25 pt-6">
            <SwapLine inverse leftValue="Seats you cannot use" rightValue="Your next game" />
          </div>
        </div>
      </section>

      <section className="border-b border-black/20 bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-[1500px] grid-cols-1 divide-y divide-black/20 px-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-6 lg:px-8">
          <Signal number="01" title="Official issuer transfer" body="Tickets move through the source app." />
          <Signal number="02" title="Protected payment" body="Terms are accepted before money moves." />
          <Signal number="03" title="Clear evidence labels" body="Know exactly what has been checked." />
        </div>
      </section>

      {marketplaceEmpty && (
        <section className="py-20 lg:py-32">
          <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="grid gap-10 lg:grid-cols-[.75fr_1.25fr] lg:gap-20">
                <div>
                  <p className="section-label">00 / Opening fixture</p>
                  <h2 className="font-display mt-5 text-5xl uppercase leading-[0.88] sm:text-7xl">Build the first matchup.</h2>
                  <p className="mt-6 max-w-md text-sm leading-7 text-muted-foreground">There is no invented inventory here. Start with tickets you own or post the game you want.</p>
                </div>
                <div className="border-t border-border">
                  <StartLink index="A" href="/list" icon={ListPlus} title="List tickets" body="Sell, swap, or add cash." />
                  <StartLink index="B" href="/wanted/new" icon={Megaphone} title="Post tickets wanted" body="Name the game and your terms." />
                  <StartLink index="C" href="/discover" icon={CalendarSearch} title="Browse events" body="Search the real event catalog." />
                  <StartLink index="D" href="/circles/new" icon={Search} title="Create a fan circle" body="Exchange with people you know." />
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      <section id="fixtures" className="border-t border-border py-20 lg:py-32">
        <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading index="01" title="The next games on the board" link="/discover" />
            {events.length ? <div className="mt-12"><GameRail games={events.slice(0, 12)} /></div> : <div className="mt-12 grid min-h-48 place-items-center border-y border-border text-center"><div><p className="font-display text-2xl uppercase">Awaiting the schedule</p><p className="mt-2 text-sm text-muted-foreground">No current events have been imported. GameSwap will not invent one.</p></div></div>}
          </Reveal>
        </div>
      </section>

      <section id="how-it-works" className="bg-[#06111b] py-20 text-[#f0eee6] lg:py-36">
        <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
          <Reveal>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#84bd3a]">02 / The exchange</p>
            <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_.65fr] lg:items-end">
              <h2 className="font-display max-w-[10ch] text-6xl uppercase leading-[0.84] sm:text-8xl lg:text-9xl">One clear route from offer to game.</h2>
              <p className="max-w-md text-sm leading-7 text-white/65">Payment authorization comes first. Official issuer transfer and recipient confirmation determine when the exchange clears.</p>
            </div>
            <div className="mt-16"><ProcessSteps /></div>
          </Reveal>
        </div>
      </section>

      <section id="trust" className="grid min-h-[44rem] lg:grid-cols-2">
        <div className="relative min-h-[28rem] lg:min-h-full">
          <Image src="/images/season-seats.jpg" alt="Rows of stadium seats ready for matchday" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
        </div>
        <div className="flex items-center bg-card px-4 py-20 sm:px-10 lg:px-16 lg:py-28">
          <Reveal>
            <p className="section-label">03 / Trust, made legible</p>
            <h2 className="font-display mt-5 max-w-[9ch] text-6xl uppercase leading-[0.86] sm:text-7xl">Know what was checked.</h2>
            <p className="mt-6 max-w-lg text-sm leading-7 text-muted-foreground">Uploaded evidence, user confirmation, and issuer verification are different claims. GameSwap labels each one separately.</p>
            <div className="mt-12"><VerificationGrid /></div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

function Signal({ number, title, body }: { number: string; title: string; body: string }) {
  return <div className="grid grid-cols-[2rem_1fr] gap-4 py-5 sm:px-5 lg:py-7"><span className="font-mono text-[10px]">{number}</span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs opacity-70">{body}</p></div></div>;
}

function StartLink({ index, href, icon: Icon, title, body }: { index: string; href: string; icon: typeof ListPlus; title: string; body: string }) {
  return <Link href={href} className="group grid grid-cols-[2rem_2.5rem_1fr_auto] items-center gap-3 border-b border-border py-5 transition-colors hover:border-primary sm:gap-5"><span className="font-mono text-[10px] text-muted-foreground">{index}</span><Icon className="h-5 w-5 text-primary" aria-hidden /><div><p className="font-display text-xl uppercase sm:text-2xl">{title}</p><p className="text-xs text-muted-foreground">{body}</p></div><ArrowUpRight className="h-5 w-5 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" aria-hidden /></Link>;
}

function SectionHeading({ index, title, link }: { index: string; title: string; link: string }) {
  return <div className="flex items-end justify-between gap-6 border-b border-border pb-7"><div><p className="section-label">{index} / Marketplace</p><h2 className="font-display mt-4 max-w-[12ch] text-5xl uppercase leading-[0.9] sm:text-7xl">{title}</h2></div><Link href={link} className="hidden items-center gap-2 pb-1 text-sm font-semibold sm:flex">View all <ArrowUpRight className="h-4 w-4" aria-hidden /></Link></div>;
}
