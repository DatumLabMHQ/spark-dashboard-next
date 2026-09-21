import { config } from '@/datum.config';
import { searchItems } from '@/lib/data';
import { platformStatus } from '@/lib/platform';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { CommandMenu } from '@/components/command-menu';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SignInButton } from '@/components/gate';

export async function SiteHeader() {
  const [s, items] = await Promise.all([platformStatus(), searchItems().catch(() => [])]);
  const status = s.source === 'dashboard' ? { label: 'Live data', cls: 'text-(--green)' }
    : s.sample ? { label: 'Sample data', cls: 'text-(--brand-blue)' }
    : s.ok === null ? { label: 'Platform unreachable', cls: 'text-(--red)' }
    : s.ok ? { label: `Platform healthy · ${s.asOf ?? ''}`, cls: 'text-(--green)' } : { label: 'Platform degraded', cls: 'text-(--yellow)' };
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 h-4 data-vertical:self-auto" />
        <span className="truncate text-base font-medium">{config.title}</span>
        <div className="ml-auto flex items-center gap-2">
          <CommandMenu items={items} />
          <Badge variant="outline" className={`hidden sm:inline-flex ${status.cls}`}><span className="size-1.5 rounded-full bg-current" />{status.label}</Badge>
          <SignInButton />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
