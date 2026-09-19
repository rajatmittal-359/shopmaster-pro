import AskPanel from '@/components/assist/AskPanel';
import AssistLogs from '@/components/admin/AssistLogs';
import EvalTrend from '@/components/admin/EvalTrend';
import PageHeader from '@/components/panel/PageHeader';

export const metadata = { title: 'Ask ShopMaster' };

export default function AdminAskPage() {
  return (
    <>
      <PageHeader title="Ask ShopMaster" lead="The platform this week, any order or seller by name, the rulebook and the plan - and below, what sellers and customers have been asking." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <AskPanel role="admin" />
        <div className="space-y-6">
          <EvalTrend />
          <AssistLogs />
        </div>
      </div>
    </>
  );
}
