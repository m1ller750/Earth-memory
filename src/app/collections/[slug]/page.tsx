import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RecordCard } from "@/components/record/RecordCard";
import { Badge } from "@/components/ui/Badge";
import { Container, PageHeader } from "@/components/ui/layout";
import { getViewer } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { getCollection } from "@/server/community";

export async function generateMetadata({ params }: PageProps<"/collections/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCollection(slug, null);
  return { title: data?.collection.title ?? "Collection" };
}

export default async function CollectionPage({ params }: PageProps<"/collections/[slug]">) {
  const { slug } = await params;
  const { t, locale } = await getI18n();
  const data = await getCollection(slug, await getViewer());
  if (!data) notFound();
  const { collection, items, members, institution } = data;
  return (
    <Container>
      <PageHeader
        eyebrow={t.community.collections}
        title={collection.title}
        lede={collection.description}
        actions={collection.collaborative ? <Badge tone="cyan">{t.community.collaborative}</Badge> : undefined}
      />
      <p className="mb-6 text-sm text-mist-400">
        {institution && (
          <>
            <Link href={`/institutions/${institution.slug}`} className="text-aurora-cyan hover:underline">
              {institution.name}
            </Link>
            {" · "}
          </>
        )}
        {members.map((m, i) => (
          <span key={m.id}>
            {i > 0 ? ", " : ""}
            <Link href={`/contributors/${m.id}`} className="text-mist-200 hover:underline">
              {m.name}
            </Link>
          </span>
        ))}
      </p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((r) => (
          <RecordCard key={r.id} record={r} t={t} locale={locale} />
        ))}
      </div>
    </Container>
  );
}
