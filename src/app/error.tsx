"use client";

import { CloudOff } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Container, EmptyState } from "@/components/ui/layout";
import { useI18n } from "@/lib/i18n/client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Container className="py-24">
      <EmptyState
        icon={<CloudOff className="h-6 w-6" />}
        title={t.errors.generic}
        body={error.digest ? `Reference: ${error.digest}` : undefined}
        action={
          <Button variant="primary" onClick={() => reset()}>
            {t.common.tryAgain}
          </Button>
        }
      />
    </Container>
  );
}
