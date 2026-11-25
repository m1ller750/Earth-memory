import type { Metadata } from "next";
import { EarthAiChat } from "@/components/ai/EarthAiChat";
import { Badge } from "@/components/ui/Badge";
import { Container, PageHeader } from "@/components/ui/layout";
import { activeModelName, aiStatus } from "@/lib/ai/provider";
import { format } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.ai.title, description: t.ai.lede };
}

export default async function AiPage({ searchParams }: PageProps<"/ai">) {
  const { t } = await getI18n();
  const status = await aiStatus();
  const model = status.enabled ? await activeModelName() : null;
  const q = (await searchParams).q;
  return (
    <Container className="max-w-4xl">
      <PageHeader
        eyebrow={t.nav.ai}
        title={t.ai.title}
        lede={t.ai.lede}
        actions={
          <Badge tone={status.enabled ? "violet" : "cyan"} className="whitespace-normal">
            {status.enabled ? format(t.ai.modeClaude, { model: `${status.label}${model ? ` · ${model}` : ""}` }) : t.common.demoMode}
          </Badge>
        }
      />
      <EarthAiChat initialQuestion={typeof q === "string" ? q.slice(0, 1000) : undefined} />
    </Container>
  );
}
