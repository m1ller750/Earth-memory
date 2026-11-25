import { Container } from "@/components/ui/layout";

export default function Loading() {
  return (
    <Container className="py-14" aria-busy="true" aria-live="polite">
      <div className="skeleton h-4 w-40" />
      <div className="skeleton mt-6 h-14 w-full max-w-2xl" />
      <div className="skeleton mt-4 h-5 w-full max-w-xl" />
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="panel p-4">
            <div className="skeleton h-36 w-full" />
            <div className="skeleton mt-4 h-5 w-3/4" />
            <div className="skeleton mt-3 h-4 w-full" />
            <div className="skeleton mt-2 h-4 w-2/3" />
          </div>
        ))}
      </div>
    </Container>
  );
}
