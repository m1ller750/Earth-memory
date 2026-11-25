import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Container, EmptyState, PageHeader, SectionHeading } from "@/components/ui/layout";
import { getI18n } from "@/lib/i18n/server";
import { listCollections, listContributors, listInstitutions } from "@/server/community";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.community.title, description: t.community.lede };
}

export default async function CommunityPage() {
  const { t } = await getI18n();
  const [contributors, institutions, collections] = await Promise.all([listContributors(), listInstitutions(), listCollections()]);
  return (
    <Container>
      <PageHeader eyebrow={t.nav.community} title={t.community.title} lede={t.community.lede} />

      <section>
        <SectionHeading title={t.community.contributors} lede={t.community.reputationHelp} />
        {contributors.length === 0 ? (
          <EmptyState title={t.community.noContributors} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {contributors.map((c) => (
              <li key={c.id}>
                <Link href={`/contributors/${c.id}`} className="panel flex items-center gap-4 p-4 hover:border-white/20">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-aurora font-bold text-ink-950">
                    {c.name
                      .split(/\s+/)
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-mist-50">{c.name}</span>
                    <span className="block text-xs text-mist-400">
                      {t.roles[c.role]} · {t.community.levels[c.reputation.level]}
                    </span>
                    {c.isDemo && (
                      <Badge tone="amber" className="mt-1">
                        {t.community.demoAccount}
                      </Badge>
                    )}
                  </span>
                  <span className="text-right">
                    <span className="block font-display text-2xl text-mist-50">{c.reputation.score}</span>
                    <span className="block text-[10px] tracking-wide text-mist-500 uppercase">{t.community.reputation}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-14 grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeading title={t.community.institutions} />
          <ul className="space-y-3">
            {institutions.map((i) => (
              <li key={i.id}>
                <Link href={`/institutions/${i.slug}`} className="panel block p-4 hover:border-white/20">
                  <span className="font-semibold text-mist-50">{i.name}</span>
                  <span className="mt-1 block text-sm text-mist-400">{i.description}</span>
                  {i.isDemo && (
                    <Badge tone="amber" className="mt-2">
                      {t.origin.demo}
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <SectionHeading title={t.community.collections} />
          <ul className="space-y-3">
            {collections.map(({ collection, items, members }) => (
              <li key={collection.id}>
                <Link href={`/collections/${collection.slug}`} className="panel block p-4 hover:border-white/20">
                  <span className="font-semibold text-mist-50">{collection.title}</span>
                  <span className="mt-1 block text-sm text-mist-400">{collection.description}</span>
                  <span className="mt-2 flex gap-3 font-mono text-[11px] text-mist-500 uppercase">
                    <span>
                      {items} {t.community.items}
                    </span>
                    <span>
                      {members} {t.community.members}
                    </span>
                    {collection.collaborative && <span className="text-aurora-cyan">{t.community.collaborative}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Container>
  );
}
