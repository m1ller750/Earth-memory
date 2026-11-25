import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/brand/Logo";
import { RegisterForm } from "@/components/auth/AuthForms";
import { Container } from "@/components/ui/layout";
import { getViewer } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.register };
}

export default async function RegisterPage() {
  const { t } = await getI18n();
  if (await getViewer()) redirect("/contribute");
  return (
    <Container className="flex max-w-md flex-col items-center py-16">
      <LogoMark className="h-12 w-12" />
      <h1 className="mt-6 text-center font-display text-4xl font-semibold text-mist-50">{t.auth.registerTitle}</h1>
      <p className="mt-2 text-center text-sm text-mist-400">{t.auth.registerLede}</p>
      <div className="panel mt-8 w-full p-6 sm:p-8">
        <RegisterForm />
      </div>
    </Container>
  );
}
