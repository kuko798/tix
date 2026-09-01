const STEPS = [
  {
    title: "Agree",
    body: "Build an offer with tickets, cash, or both. Both fans confirm terms before anything moves.",
  },
  {
    title: "Authorize",
    body: "Stripe authorizes the purchase amount or refundable exchange deposit before tickets move.",
  },
  {
    title: "Issuer transfer",
    body: "Each fan sends tickets through the issuer's own official transfer tool, tracked step by step.",
  },
  {
    title: "Release",
    body: "After receipt is confirmed, Stripe captures the payment, returns an eligible deposit, and schedules the seller payout.",
  },
];

export function ProcessSteps() {
  return (
    <ol className="grid grid-cols-1 border-t border-white/25 sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((step, index) => (
        <li
          key={step.title}
          className={cnPanel(index)}
        >
          <p className="font-mono text-[10px] text-[#84bd3a]">0{index + 1}</p>
          <p className="font-display mt-10 text-3xl uppercase leading-none">{step.title}</p>
          <p className="mt-4 max-w-[32ch] text-sm leading-6 text-white/60">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

function cnPanel(index: number) {
  const edge =
    index < 3
      ? "border-b border-white/20 sm:[&:nth-child(odd)]:border-r lg:border-b-0 lg:border-r lg:border-white/20"
      : "";
  return `py-8 sm:p-7 lg:min-h-72 ${edge}`;
}
