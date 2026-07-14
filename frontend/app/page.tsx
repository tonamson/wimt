"use client";

import { useState } from "react";
import { AnomaliesPanel } from "@/components/anomalies-panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MetricStrip } from "@/components/metric-strip";
import { ProviderBreakdown } from "@/components/provider-breakdown";
import { ProxySettingsPanel } from "@/components/proxy-settings-panel";
import { RequestChart } from "@/components/request-chart";
import { RequestDetail } from "@/components/request-detail";
import { RequestTable } from "@/components/request-table";
import { TopBar } from "@/components/top-bar";
import { defaultChartVisible } from "@/lib/dashboard-constants";
import { useDashboardData } from "@/lib/use-dashboard-data";
import type { ChartKey } from "@/lib/types";

export default function Home() {
  const {
    summary,
    settings,
    setSettings,
    requests,
    chartRows,
    nextCursor,
    cursorStack,
    proxyBaseUrl,
    dateSelection,
    requestsLoading,
    isSoftRefreshing,
    savingSettings,
    settingsStatus,
    selected,
    setSelected,
    confirmClear,
    setConfirmClear,
    currentCursor,
    refresh,
    openDetail,
    saveSettings,
    clearLogs,
    nextPage,
    previousPage,
    updateDateSelection,
  } = useDashboardData();

  const [chartVisible, setChartVisible] = useState(defaultChartVisible);

  const anomalies = (
    <AnomaliesPanel
      usageMissing={summary.totals.usageMissing}
      upstreamErrors={summary.upstreamErrors ?? 0}
      modelsObserved={summary.byModel.length}
      retentionDays={settings.retentionDays ?? 14}
    />
  );

  const proxySettings = (
    <ProxySettingsPanel
      baseUrl={proxyBaseUrl}
      settings={settings}
      onSettingsChange={setSettings}
      onSave={() => void saveSettings()}
      saving={savingSettings}
      status={settingsStatus}
    />
  );

  const providers = <ProviderBreakdown rows={summary.byProvider} />;

  return (
    <main className="flex min-h-dvh min-w-0 flex-col overflow-x-hidden bg-[var(--bg)] text-[var(--text)]">
      <TopBar
        dateSelection={dateSelection}
        onDateChange={updateDateSelection}
        onRefresh={() => void refresh(currentCursor, { mode: "soft" })}
        onClear={() => setConfirmClear(true)}
        loading={requestsLoading || isSoftRefreshing}
      />

      <MetricStrip totals={summary.totals} />

      <div className="mx-auto grid w-full min-w-0 max-w-[1600px] flex-1 gap-3 overflow-x-hidden px-3 py-3 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] lg:px-8">
        {/* Mobile order: anomalies → chart → log → providers → settings */}
        <div className="order-1 min-w-0 lg:hidden">{anomalies}</div>

        <div className="order-2 flex min-w-0 flex-col gap-3 lg:order-1">
          <RequestChart
            rows={chartRows}
            visible={chartVisible}
            onToggle={(key: ChartKey) =>
              setChartVisible((state) => ({ ...state, [key]: !state[key] }))
            }
          />
          <RequestTable
            requests={requests}
            loading={requestsLoading}
            refreshing={isSoftRefreshing}
            pageIndex={cursorStack.length + 1}
            canPrevious={cursorStack.length > 0}
            canNext={nextCursor !== null}
            onPrevious={previousPage}
            onNext={nextPage}
            onSelect={(row) => void openDetail(row)}
          />
        </div>

        <div className="order-3 flex min-w-0 flex-col gap-3 lg:hidden">
          {providers}
          {proxySettings}
        </div>

        <aside className="order-4 hidden min-w-0 flex-col gap-3 lg:order-2 lg:flex">
          {anomalies}
          {proxySettings}
          {providers}
        </aside>
      </div>

      {selected ? (
        <RequestDetail selected={selected} onClose={() => setSelected(null)} />
      ) : null}

      <ConfirmDialog
        open={confirmClear}
        title="Clear all request logs?"
        description="This permanently deletes every stored request log. Summary and chart data will reset to empty. Logs older than the retention window are also purged automatically."
        confirmLabel="Clear logs"
        cancelLabel="Cancel"
        danger
        onConfirm={() => void clearLogs()}
        onCancel={() => setConfirmClear(false)}
      />
    </main>
  );
}
