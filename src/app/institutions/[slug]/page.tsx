import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Container, PageHeader, SectionHeading } from "@/components/ui/layout";
import { getViewer } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { getInstitution } from "@/server/community";

export async function generateMetadata({ params }: PageProps<"/institutions/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getInstitution(slug, null);
  return { title: data?.institution.name ?? "Institution" };
}

export default async function InstitutionPage({ params }: PageProps<"/institutions/[slug]">) {
  const { slug } = await params;
  const { t } = await getI18n();
  const data = await getInstitution(slug, await getViewer());
  if (!data) notFound();
  const { institution, members, collections } = data;
  return (
    <Container>
      <PageHeader
        eyebrow={`${t.community.institutions} · ${institution.kind}`}
        title={institution.name}
        lede={institution.description}
        actions={institution.isDemo ? <Badge tone="amber">{t.origin.demo}</Badge> : institution.verified ? <Badge tone="emerald">✓</Badge> : undefined}
      />
      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <SectionHeading title={t.community.institutionMembers} />
          <ul className="panel divide-y divide-white/[0.06]">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between p-4">
                <Link href={`/contributors/${m.id}`} className="font-medium text-mist-50 hover:underline">
                  {m.name}
                </Link>
                <span className="text-xs text-mist-400">{t.roles[m.role]}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <SectionHeading title={t.community.institutionCollections} />
          <ul className="space-y-3">
            {collections.map((c) => (
              <li key={c.id}>
                <Link href={`/collections/${c.slug}`} className="panel block p-4 hover:border-white/20">
                  <span className="font-semibold text-mist-50">{c.title}</span>
                  <span className="mt-1 block text-sm text-mist-400">{c.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Container>
  );
}
