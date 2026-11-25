import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiKeys } from "@/components/account/ApiKeys";
import { RecordCard } from "@/components/record/RecordCard";
import { Container, KeyValue, PageHeader, SectionHeading } from "@/components/ui/layout";
import { can } from "@/lib/access/policy";
import { getViewer } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { apiKeys } from "@/lib/db/schema";
import { getI18n } from "@/lib/i18n/server";
import { listRecords } from "@/server/records";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.account.title };
}

export default async function AccountPage() {
  const { t, locale } = await getI18n();
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/account");
  const db = await getDb();
  const [keys, mine] = await Promise.all([
    db.select().from(apiKeys).where(eq(apiKeys.userId, viewer.id)).orderBy(desc(apiKeys.createdAt)),
    listRecords({ contributorId: viewer.id }, viewer, { limit: 12 }),
  ]);
  return (
    <Container>
      <PageHeader eyebrow={t.nav.account} title={t.account.title} />
      <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <section className="panel h-fit p-5">
          <h2 className="eyebrow mb-3">{t.account.profile}</h2>
          <dl>
            <KeyValue label={t.auth.name}>{viewer.name}</KeyValue>
            <KeyValue label={t.auth.email}>{viewer.email}</KeyValue>
            <KeyValue label="Role">{t.roles[viewer.role]}</KeyValue>
          </dl>
          <Link href={`/contributors/${viewer.id}`} className="mt-4 inline-block text-sm text-aurora-cyan hover:underline">
            {t.community.reputation} →
          </Link>
        </section>
        <section id="api-keys" className="scroll-mt-24">
          <SectionHeading title={t.account.apiKeys} lede={t.account.apiKeysLede} />
          <ApiKeys
            canVerify={can(viewer, "review:community")}
            keys={keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null, revokedAt: k.revokedAt?.toISOString() ?? null }))}
          />
          <p className="mt-4 text-xs text-mist-500">
            <Link href="/developers" className="text-aurora-cyan hover:underline">
              {t.nav.developers} →
            </Link>
          </p>
        </section>
      </div>
      <section className="mt-14">
        <SectionHeading title={t.account.yourRecords} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {mine.items.map((r) => (
            <RecordCard key={r.id} record={r} t={t} locale={locale} />
          ))}
        </div>
      </section>
    </Container>
  );
}
