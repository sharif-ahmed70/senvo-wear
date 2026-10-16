import { ZReportPreview } from "./z-report-preview";

export default async function ZReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ZReportPreview sessionId={id} />;
}
