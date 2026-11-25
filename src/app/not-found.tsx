import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Container, EmptyState } from "@/components/ui/layout";
import { getI18n } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <Container className="py-24">
      <EmptyState
        icon={<Compass className="h-6 w-6" />}
        title={t.errors.notFound}
        body={t.errors.notFoundHint}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href="/explore" variant="primary">
              {t.home.ctaExplore}
            </ButtonLink>
            <ButtonLink href="/archive" variant="secondary">
              {t.nav.archive}
            </ButtonLink>
          </div>
        }
      />
    </Container>
  );
}
