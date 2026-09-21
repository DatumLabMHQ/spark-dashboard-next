// Inside the frame, so a wrong market id or route still looks like the dashboard.
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <>
      <PageHeader eyebrow="Not found" question="There is nothing at this address." answer="The market or page you asked for is not in this dashboard. It may have been delisted, or the link is out of date." />
      <div className="flex gap-2 px-4 lg:px-6">
        <Button render={<Link href="/" />}>Back to the overview</Button>
        <Button variant="outline" render={<Link href="/markets" />}>All markets</Button>
      </div>
    </>
  );
}
