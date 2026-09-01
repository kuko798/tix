const TIERS = [
  {
    label: "Information submitted",
    body: "The seller entered their own ticket details. Nothing has been checked yet.",
  },
  {
    label: "Evidence reviewed",
    body: "A GameSwap reviewer checked redacted proof of ownership against the listing.",
  },
  {
    label: "Transfer initiated or accepted",
    body: "The official issuer transfer has started, or the buyer already accepted it.",
  },
  {
    label: "Issuer verified",
    body: "Shown only when an authorized issuer integration directly confirms the ticket. Uploaded files and user confirmations never qualify.",
  },
];

export function VerificationGrid() {
  return (
    <dl className="grid grid-cols-1 gap-x-16 gap-y-10 sm:grid-cols-2">
      {TIERS.map((tier) => (
        <div key={tier.label}>
          <dt className="font-medium">{tier.label}</dt>
          <dd className="mt-2 max-w-[48ch] text-sm leading-relaxed text-muted-foreground">{tier.body}</dd>
        </div>
      ))}
    </dl>
  );
}
