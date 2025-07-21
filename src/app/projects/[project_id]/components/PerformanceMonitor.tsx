import { useWorkspaceStore } from "@/stores/WorkspaceStoreProvider";

const formatMs = (ms: number | null) => (ms ? `${ms.toFixed(0)} ms` : "N/A");

export function PerformanceMonitor() {
  const metrics = useWorkspaceStore((state) => state.performanceMetrics);
  const isDev = process.env.NODE_ENV === "development";
  // E2E 模式的判断：如果 Router 时间不存在，就认为是 E2E
  const isE2EMode =
    metrics.routerDecisionTime === null &&
    metrics.preJudgmentTime === null &&
    metrics.fullResponseTime !== null;

  const serverMetrics = [
    {
      label: "本地决策耗时",
      value: formatMs(metrics.preJudgmentTime),
      show: !isE2EMode,
    },
    {
      label: "Router Agent 耗时",
      value: formatMs(metrics.routerDecisionTime),
      show: !isE2EMode,
    },
  ].filter((m) => m.show && m.value !== "N/A");

  const clientMetrics = [
    {
      label: "客户端首包时间 (TTFT)",
      value: formatMs(metrics.timeToFirstToken),
    },
    { label: "客户端完整响应耗时", value: formatMs(metrics.fullResponseTime) },
  ];
  if (!isDev) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-neutral-900/80 backdrop-blur-sm border border-neutral-700 text-white p-3 rounded-lg shadow-lg z-50 text-xs font-mono w-72">
      <h4 className="font-bold text-sm mb-2 text-yellow-400">
        性能监控 ({isE2EMode ? "E2E 模式" : "三级Agent模式"})
      </h4>

      {serverMetrics.length > 0 && (
        <div className="text-neutral-500 text-[10px] uppercase">
          服务器预处理
        </div>
      )}
      <div className="space-y-1 mb-2 pl-2 border-l border-neutral-700">
        {serverMetrics.map(({ label, value }) => (
          <div key={label} className="flex justify-between items-center">
            <span className="text-neutral-400">{label}:</span>
            <span className="font-semibold text-neutral-200">{value}</span>
          </div>
        ))}
      </div>

      <div className="text-neutral-500 text-[10px] uppercase">客户端感知</div>
      <div className="space-y-1 pl-2 border-l border-neutral-700">
        {clientMetrics.map(({ label, value }) => (
          <div key={label} className="flex justify-between items-center">
            <span className="text-neutral-400">{label}:</span>
            <span className="font-semibold text-neutral-200">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
