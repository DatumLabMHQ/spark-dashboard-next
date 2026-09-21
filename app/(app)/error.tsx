'use client';
// Error boundary for a page inside the frame. Says what happened in plain words and offers a retry;
// the digest is enough for the logs. Never shows a stack trace to a reader.
import { useEffect } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <>
      <PageHeader eyebrow="Something went wrong" question="This page could not load its numbers." answer={<>The platform did not answer or returned something the page did not expect. Nothing on this page is stale by accident: it is simply not shown.{error.digest ? ` Reference ${error.digest}.` : ''}</>} />
      <div className="flex gap-2 px-4 lg:px-6">
        <Button onClick={() => reset()}>Try again</Button>
        <Button variant="outline" render={<Link href="/" />}>Back to the overview</Button>
      </div>
    </>
  );
}
