import type { Metadata } from "next";
import { TimelineExplorer } from "@/components/timeline/TimelineExplorer";
import { Container, PageHeader } from "@/components/ui/layout";
import { getViewer } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { getTimelineObservations, getTimelineRecords } from "@/server/timeline";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.timeline.title, description: t.timeline.lede };
}

export default async function TimelinePage() {
  const { t } = await getI18n();
  const [records, observations] = await Promise.all([getTimelineRecords(await getViewer()), getTimelineObservations()]);
  return (
    <Container wide>
      <PageHeader eyebrow={t.nav.timeline} title={t.timeline.title} lede={t.timeline.lede} />
      <TimelineExplorer records={records} observations={observations} />
    </Container>
  );
}
