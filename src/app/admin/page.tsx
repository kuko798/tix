import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/server/policy";
import { ModerationControls } from "./moderation-controls";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const [reports, evidence, disputes, transactions, users, listings] = await Promise.all([
    prisma.report.findMany({ where: { status: "open" }, orderBy: { createdAt: "asc" }, take: 50 }),
    prisma.ownershipEvidence.findMany({ where: { reviewStatus: "pending" }, orderBy: { createdAt: "asc" }, take: 50 }),
    prisma.dispute.findMany({ where: { status: { not: "resolved" } }, orderBy: { filedAt: "asc" }, take: 50 }),
    prisma.transaction.findMany({ orderBy: { createdAt: "desc" }, take: 50, select: { id: true, status: true, type: true, createdAt: true } }),
    prisma.user.findMany({ where: { accountStatus: { not: "active" } }, take: 50, select: { id: true, name: true, email: true, accountStatus: true } }),
    prisma.listing.findMany({ where: { reports: { some: { status: "open" } } }, take: 50, select: { id: true, section: true, row: true, status: true } }),
  ]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="font-display text-3xl leading-[1.08] sm:text-4xl">Marketplace review</h1>
      <p className="mt-2 text-sm text-muted-foreground">Admin access is checked against the persisted user role on every request and action.</p>
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <Queue title="Open reports" empty="No open reports.">{reports.map((item) => <Row key={item.id} title={item.reason} detail={item.details ?? "No additional details"}><ModerationControls targetType="report" targetId={item.id} actions={["under_review", "resolved", "dismissed"]} /></Row>)}</Queue>
        <Queue title="Ownership evidence" empty="No evidence awaiting review.">{evidence.map((item) => <Row key={item.id} title={item.originalName} detail={`${item.mimeType}, ${(item.byteSize / 1024).toFixed(0)} KB. Private object: ${item.objectKey}`}><Link className="mt-3 inline-block text-sm font-medium text-primary" href={`/api/admin/evidence/${item.id}`} target="_blank">Open private evidence</Link><ModerationControls targetType="evidence" targetId={item.id} actions={["approved", "rejected"]} /></Row>)}</Queue>
        <Queue title="Disputes" empty="No open disputes.">{disputes.map((item) => <Row key={item.id} title={item.reason} detail={item.statement}><ModerationControls targetType="dispute" targetId={item.id} actions={["under_review", "resolved"]} /></Row>)}</Queue>
        <Queue title="Recent transactions" empty="No transactions.">{transactions.map((item) => <Row key={item.id} title={`${item.type.replaceAll("_", " ")} - ${item.status.replaceAll("_", " ")}`} detail={item.createdAt.toISOString()}>{!["refunded", "cancelled", "awaiting_payment"].includes(item.status) && <ModerationControls targetType="transaction" targetId={item.id} actions={["refund"]} />}</Row>)}</Queue>
        <Queue title="Flagged accounts" empty="No restricted accounts.">{users.map((item) => <Row key={item.id} title={`${item.name} (${item.accountStatus})`} detail={item.email}><ModerationControls targetType="user" targetId={item.id} actions={["active", "suspended", "banned"]} /></Row>)}</Queue>
        <Queue title="Reported listings" empty="No reported listings.">{listings.map((item) => <Row key={item.id} title={`Section ${item.section}, Row ${item.row}`} detail={item.status}><ModerationControls targetType="listing" targetId={item.id} actions={["paused", "cancelled"]} /></Row>)}</Queue>
      </div>
    </div>
  );
}

function Queue({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <section><h2 className="font-display text-2xl">{title}</h2><div className="mt-4 space-y-3">{hasChildren ? children : <p className="border border-border bg-card p-4 text-sm text-muted-foreground">{empty}</p>}</div></section>;
}
function Row({ title, detail, children }: { title: string; detail: string; children?: React.ReactNode }) {
  return <article className="border border-border bg-card p-4"><p className="text-sm font-medium">{title}</p><p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{detail}</p>{children}</article>;
}
