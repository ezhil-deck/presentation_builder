import ChecksTable, { ChecksSummary } from '../components/ChecksTable.jsx';
import { isReportV1 } from '../lib/checks.js';

export default function ChecksTab({ id, report }) {
  if (!report) return <p className="text-sm text-neutral-500">Not built: no report.json for this brand.</p>;
  if (!isReportV1(report.checks)) {
    return (
      <p className="text-sm text-neutral-500">
        checks not run for this build (rebuild)
        {report.checks?.version ? (
          <span className="text-neutral-400"> — report.checks is version {report.checks.version}</span>
        ) : null}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <ChecksSummary summary={report.checks.summary} />
      <ChecksTable id={id} checks={report.checks} />
    </div>
  );
}
