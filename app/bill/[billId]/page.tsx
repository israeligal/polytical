import Link from "next/link";
import { notFound } from "next/navigation";
import { getBillById } from "@/app/lib/bills/repo";
import { knessetBillUrl } from "@/app/lib/bills/external";
import { getAnnouncedAgendaItemByBill } from "@/app/lib/agenda/read-repo";
import { getAgendaStanceState } from "@/app/lib/agenda-stances/service";
import { AgendaStanceWidget } from "@/components/agenda-stance-widget";
import { getSession } from "@/lib/auth";
import { ChevronForward, ArrowUpRight, Document } from "@/components/icons";
import { formatDate } from "@/lib/time";
import { BILL_CONTAINER } from "@/components/skeletons/containers";
import { EnactedLawPanel } from "@/components/enacted-law-panel";
import { BillLineage } from "@/components/bill-lineage";

function InitiatorChip({ personId, nameHe, muted = false }: { personId: number; nameHe: string; muted?: boolean }) {
  return (
    <li>
      <Link
        href={`/politician/${personId}`}
        className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-muted/60 ${
          muted ? "border-border text-muted-foreground" : "border-primary text-primary"
        }`}
      >
        {nameHe}
      </Link>
    </li>
  );
}

export default async function BillPage({ params }: { params: Promise<{ billId: string }> }) {
  const { billId: raw } = await params;
  const billId = Number(raw);
  if (!Number.isInteger(billId)) notFound();
  const [bill, agendaItem] = await Promise.all([
    getBillById({ billId }),
    getAnnouncedAgendaItemByBill({ billId }),
  ]);
  if (!bill) notFound();

  // Pre-vote widget: only when the bill has an announced agenda item (curated as
  // approaching its decisive vote). Session/stance are loaded only then.
  const session = agendaItem ? await getSession() : null;
  const agendaState = agendaItem && session?.user
    ? await getAgendaStanceState({ userId: session.user.id, agendaItemId: agendaItem.id })
    : null;

  const meta: { label: string; value: string }[] = [];
  if (bill.subTypeDesc) meta.push({ label: "סוג", value: bill.subTypeDesc });
  if (bill.statusDesc) meta.push({ label: "סטטוס", value: bill.statusDesc });
  if (bill.knessetNum != null) meta.push({ label: "כנסת", value: `ה-${bill.knessetNum}` });
  if (bill.publicationDate) meta.push({ label: "פורסם", value: formatDate(bill.publicationDate) });

  const proposers = bill.initiators.filter((i) => i.isInitiator);
  const coSigners = bill.initiators.filter((i) => !i.isInitiator);

  return (
    <main className={BILL_CONTAINER}>
      <Link
        href="/politicians"
        className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronForward className="h-4 w-4 rotate-180" />
        חזרה לפוליטיקאים
      </Link>

      <h1 className="font-display text-2xl font-black text-foreground sm:text-3xl">{bill.nameHe}</h1>

      {bill.splitParent && <BillLineage parent={bill.splitParent} className="mt-2" />}

      {meta.length > 0 && (
        <dl className="mt-5 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
          {meta.map((m) => (
            <div key={m.label} className="flex items-center justify-between gap-3 bg-card px-4 py-3">
              <dt className="text-sm text-muted-foreground">{m.label}</dt>
              <dd className="text-sm font-bold text-foreground">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {bill.summaryLaw && (
        <>
          <h2 className="mb-2 mt-8 font-display text-xl font-bold text-foreground">תקציר</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{bill.summaryLaw}</p>
        </>
      )}

      <EnactedLawPanel laws={bill.enactedLaws} />

      {proposers.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-display text-xl font-bold text-foreground">יוזמי ההצעה</h2>
          <ul className="flex flex-wrap gap-2">
            {proposers.map((i) => (
              <InitiatorChip key={i.personId} personId={i.personId} nameHe={i.nameHe} />
            ))}
          </ul>
        </>
      )}

      {coSigners.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-display text-xl font-bold text-foreground">חתומים על ההצעה</h2>
          <ul className="flex flex-wrap gap-2">
            {coSigners.map((i) => (
              <InitiatorChip key={i.personId} personId={i.personId} nameHe={i.nameHe} muted />
            ))}
          </ul>
        </>
      )}

      {bill.documents.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-display text-xl font-bold text-foreground">נוסח רשמי</h2>
          <ul className="space-y-2">
            {bill.documents.map((d) => (
              <li key={`${d.documentBillId}-${d.format}`}>
                <a
                  href={d.filePath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/60"
                >
                  <Document className="h-4 w-4 text-muted-foreground" />
                  <span>{d.groupTypeDesc ?? "מסמך"}</span>
                  {d.format && <span className="text-xs text-muted-foreground">({d.format})</span>}
                  <ArrowUpRight className="ms-auto h-4 w-4 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {bill.linkedVote && (
        <>
          <h2 className="mb-3 mt-8 font-display text-xl font-bold text-foreground">הצבעה במליאה</h2>
          <Link
            href={`/vote/${bill.linkedVote.voteId}`}
            className="block rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground transition-colors hover:bg-muted/60"
          >
            <span className="line-clamp-2 font-semibold">{bill.linkedVote.titleHe ?? bill.nameHe}</span>
            {bill.linkedVote.voteDate && (
              <span className="mt-0.5 block text-xs text-muted-foreground nums">{formatDate(bill.linkedVote.voteDate)}</span>
            )}
            <span className="mt-1 block text-xs font-semibold text-primary">לצפייה בהצבעה ולקביעת עמדה ←</span>
          </Link>
        </>
      )}

      {agendaItem && (
        <>
          <h2 className="mb-1 mt-8 font-display text-xl font-bold text-foreground">על סדר היום</h2>
          <AgendaStanceWidget
            agendaItemId={agendaItem.id}
            billId={bill.billId}
            initialStance={agendaState?.stance ?? null}
            initialAggregate={agendaState?.aggregate ?? null}
            loggedIn={Boolean(session?.user)}
          />
        </>
      )}

      <a
        href={knessetBillUrl(bill.billId)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        דף ההצעה באתר הכנסת
        <ArrowUpRight className="h-4 w-4" />
      </a>
      <p className="mt-3 text-xs text-muted-foreground">נתונים ממקור רשמי · הכנסת (OData)</p>
    </main>
  );
}
