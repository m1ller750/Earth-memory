import { LogIn } from "lucide-react";
import type { Metadata } from "next";
import { ContributeForm } from "@/components/contribute/ContributeForm";
import { ButtonLink } from "@/components/ui/Button";
import { Container, EmptyState, PageHeader } from "@/components/ui/layout";
import { activeModelName, aiStatus } from "@/lib/ai/provider";
import { getViewer } from "@/lib/auth/session";
import { allCountryCodes, countryName } from "@/lib/geo/countries";
import { getI18n } from "@/lib/i18n/server";
import { viewerCommunities } from "@/server/contributions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.contribute.title, description: t.contribute.lede };
}

export default async function ContributePage({ searchParams }: PageProps<"/contribute">) {
  const { t, locale } = await getI18n();
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <Container className="max-w-3xl">
        <PageHeader eyebrow={t.nav.contribute} title={t.contribute.title} lede={t.contribute.lede} />
        <EmptyState
          icon={<LogIn className="h-6 w-6" />}
          title={t.common.signInToContinue}
          body={t.contribute.signInNeeded}
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <ButtonLink href="/login?next=/contribute" variant="primary">
                {t.nav.signIn}
              </ButtonLink>
              <ButtonLink href="/register" variant="secondary">
                {t.auth.register}
              </ButtonLink>
            </div>
          }
        />
      </Container>
    );
  }
  const sp = await searchParams;
  const initialCountry = typeof sp.country === "string" && /^[A-Z]{2}$/i.test(sp.country) ? sp.country.toUpperCase() : undefined;
  const [communities, ai] = await Promise.all([viewerCommunities(viewer), aiStatus()]);
  const model = ai.enabled ? await activeModelName() : null;
  const countries = allCountryCodes()
    .map((code) => ({ code, name: countryName(code, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  return (
    <Container>
      <PageHeader eyebrow={t.nav.contribute} title={t.contribute.title} lede={t.contribute.lede} />
      <ContributeForm
        communities={communities}
        countries={countries}
        aiEnabled={ai.enabled}
        aiLabel={`${ai.label}${model ? ` · ${model}` : ""}`}
        maxUploadMb={Number(process.env.MAX_UPLOAD_MB ?? 25)}
        initialCountry={initialCountry}
        defaultAttribution={viewer.name}
      />
    </Container>
  );
}
