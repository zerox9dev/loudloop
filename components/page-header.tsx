import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur md:px-6">
      <SidebarTrigger className="-ml-1 size-8 text-muted-foreground" />
      <Separator orientation="vertical" className="h-5" />
      <h1 className="text-[19px] font-semibold tracking-tight">{title}</h1>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{children}</div>
    </header>
  );
}
