// Says when the numbers cannot be trusted yet: sample data (no platform key) or a draft
// (brief not signed off, reconciliation not logged). Nothing renders once the page is live.
import { FlaskIcon, WarningIcon } from '@phosphor-icons/react/ssr';
import { config } from '@/datum.config';
import { platformStatus } from '@/lib/platform';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export async function StatusBanner() {
  const s = await platformStatus();
  if (s.sample) {
    return (
      <Alert className="border-(--brand-blue)/30 bg-(--brand-blue)/5">
        <FlaskIcon />
        <AlertTitle>Sample data</AlertTitle>
        <AlertDescription>No platform key is set, so every number on this page is generated and labelled as such. Set DATUM_API_KEY to read the Datum data platform.</AlertDescription>
      </Alert>
    );
  }
  if (config.status === 'draft') {
    return (
      <Alert className="border-(--yellow)/40 bg-(--yellow)/8">
        <WarningIcon />
        <AlertTitle>Draft</AlertTitle>
        <AlertDescription>Numbers are live from {s.source === 'dashboard' ? 'this dashboard’s own sources' : 'the platform'}, but the brief is not signed off and the reconciliation is not logged. Do not embed or share yet.</AlertDescription>
      </Alert>
    );
  }
  return null;
}
