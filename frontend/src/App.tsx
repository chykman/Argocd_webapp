import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Cloud,
  Database,
  GitBranch,
  Layers3,
  LoaderCircle,
  RefreshCw,
  Server,
  ShieldCheck,
  Zap,
} from "lucide-react";
import {
  getDeployments,
  getHistory,
  getOverview,
  recordVisit,
  type ClusterSnapshot,
  type HistoryPoint,
  type Overview,
  type Workload,
} from "./api";

const VisitChart = lazy(() => import("./VisitChart"));

type View = "overview" | "workloads" | "activity";

const navigation: { id: View; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "workloads", label: "Workloads", icon: Boxes },
  { id: "activity", label: "Activity", icon: Layers3 },
];

function formatUpdatedAt(timestamp: string | undefined) {
  if (!timestamp) return "Waiting for telemetry";
  return `Updated ${new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}`;
}

function WorkloadCard({ workload }: { workload: Workload }) {
  const healthy = workload.ready_replicas >= workload.desired_replicas;

  return (
    <article className="workload-card">
      <div className="workload-card__top">
        <div className="workload-icon">
          {workload.name === "api" ? <Server size={17} /> : <Cloud size={17} />}
        </div>
        <div className={`status-dot ${healthy ? "is-healthy" : "is-warning"}`} />
        <span className="workload-status">
          {healthy ? "Healthy" : "Progressing"}
        </span>
      </div>
      <div className="workload-card__title">
        <div>
          <h3>{workload.name}</h3>
          <p>Deployment</p>
        </div>
        <span className="replica-count">
          {workload.ready_replicas}/{workload.desired_replicas}
        </span>
      </div>
      <progress
        className="replica-progress"
        value={Math.min(workload.ready_replicas, workload.desired_replicas)}
        max={Math.max(workload.desired_replicas, 1)}
        aria-label={`${workload.name} ready replicas`}
      />
      <div className="workload-image" title={workload.image}>
        <span>IMAGE</span>
        <code>{workload.image.split("/").at(-1)}</code>
      </div>
    </article>
  );
}

function WorkloadsPanel({
  cluster,
}: {
  cluster: ClusterSnapshot | undefined;
}) {
  if (!cluster?.available) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">
          <CircleHelp size={21} />
        </div>
        <h3>Kubernetes workload data is not connected</h3>
        <p>
          {cluster?.message ??
            "The API will show live deployments after it is installed in the cluster."}
        </p>
      </div>
    );
  }

  if (cluster.deployments.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">
          <Boxes size={21} />
        </div>
        <h3>No matching deployments found</h3>
        <p>
          Add the observatory app label to deployments in namespace{" "}
          <code>{cluster.namespace}</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="workload-grid">
      {cluster.deployments.map((workload) => (
        <WorkloadCard key={workload.name} workload={workload} />
      ))}
    </div>
  );
}

function App() {
  const [view, setView] = useState<View>("overview");
  const [overview, setOverview] = useState<Overview>();
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [cluster, setCluster] = useState<ClusterSnapshot>();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextOverview, nextHistory, nextCluster] = await Promise.all([
        getOverview(),
        getHistory(),
        getDeployments(),
      ]);
      setOverview(nextOverview);
      setHistory(nextHistory.points);
      setCluster(nextCluster);
      setError("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Dashboard data could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialRequest = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => {
      window.clearTimeout(initialRequest);
      window.clearInterval(timer);
    };
  }, [refresh]);

  async function handleRecordVisit() {
    setIsRecording(true);
    try {
      await recordVisit();
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not record a visit.",
      );
    } finally {
      setIsRecording(false);
    }
  }

  const readyReplicas =
    cluster?.deployments.reduce(
      (total, workload) => total + workload.ready_replicas,
      0,
    ) ?? 0;
  const desiredReplicas =
    cluster?.deployments.reduce(
      (total, workload) => total + workload.desired_replicas,
      0,
    ) ?? 0;
  const pageTitle =
    view === "overview"
      ? "Platform overview"
      : view === "workloads"
        ? "Kubernetes workloads"
        : "Traffic activity";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Pulseboard home">
          <span className="brand-mark">
            <Activity size={20} strokeWidth={2.6} />
          </span>
          <span className="brand-copy">
            <strong>pulseboard</strong>
            <small>GITOPS OBSERVATORY</small>
          </span>
        </a>

        <div className="workspace-switcher">
          <div className="workspace-avatar">P</div>
          <div className="workspace-copy">
            <span>Workspace</span>
            <strong>Platform team</strong>
          </div>
          <ChevronDown size={15} />
        </div>

        <p className="nav-label">WORKSPACE</p>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              className={`nav-item ${view === id ? "is-active" : ""}`}
              key={id}
              onClick={() => setView(id)}
              type="button"
            >
              <Icon size={17} />
              <span>{label}</span>
              {id === "workloads" && cluster?.available && (
                <span className="nav-count">{cluster.deployments.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-live">
            <span className="live-pulse" />
            <div>
              <strong>{error ? "Telemetry interrupted" : "API connected"}</strong>
              <small>Auto-refresh · 15 sec</small>
            </div>
          </div>
          <button className="help-link" type="button">
            <CircleHelp size={16} />
            <span>Help center</span>
          </button>
          <div className="profile">
            <div className="profile-avatar">C</div>
            <div className="profile-copy">
              <strong>Platform engineer</strong>
              <small>DevOps workspace</small>
            </div>
            <ChevronDown size={14} />
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{pageTitle}</strong>
          </div>
          <div className="topbar-actions">
            <div className="environment-badge">
              <span />
              {cluster?.available
                ? `Kubernetes · ${cluster.namespace}`
                : "Cluster disconnected"}
            </div>
            <button
              className="icon-button"
              aria-label="Refresh dashboard data"
              onClick={() => void refresh()}
              type="button"
            >
              <RefreshCw size={16} />
            </button>
            <div className="topbar-avatar">C</div>
          </div>
        </header>

        <div className="content">
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" />
                LIVE INFRASTRUCTURE
              </div>
              <h1>{pageTitle}</h1>
              <p>
                Your applications, deployments, and runtime signals at a glance.
              </p>
            </div>
            <div className="heading-actions">
              <span className="updated-label">
                <Clock3 size={14} />
                {formatUpdatedAt(overview?.updated_at)}
              </span>
              <button
                className="primary-button"
                disabled={isRecording || isLoading}
                onClick={() => void handleRecordVisit()}
                type="button"
              >
                {isRecording ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Zap size={16} />
                )}
                Record test traffic
              </button>
            </div>
          </section>

          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button onClick={() => void refresh()} type="button">
                Retry
              </button>
            </div>
          )}

          <section className="metric-grid" aria-label="Key metrics">
            <article className="metric-card">
              <div className="metric-card__top">
                <span className="metric-icon metric-icon--violet">
                  <Activity size={18} />
                </span>
                <span className="metric-trend metric-trend--positive">
                  <ArrowUpRight size={14} />
                  Live
                </span>
              </div>
              <p className="metric-label">Total visits</p>
              <div className="metric-value">
                {isLoading ? "—" : (overview?.total_visits ?? 0).toLocaleString()}
              </div>
              <div className="metric-footnote">
                <span className="mini-bars">
                  {Array.from({ length: 12 }, (_, index) => (
                      <i key={index} />
                  ))}
                </span>
                <span>Redis-backed counter</span>
              </div>
            </article>

            <article className="metric-card">
              <div className="metric-card__top">
                <span className="metric-icon metric-icon--blue">
                  <Boxes size={18} />
                </span>
                <span className="metric-trend">
                  {cluster?.available ? "Kubernetes" : "Local mode"}
                </span>
              </div>
              <p className="metric-label">Ready replicas</p>
              <div className="metric-value">
                {cluster?.available ? `${readyReplicas}/${desiredReplicas}` : "—"}
              </div>
              <div className="metric-footnote">
                <span
                  className={`inline-status ${cluster?.status === "Healthy" ? "inline-status--good" : ""}`}
                />
                <span>{cluster?.status ?? "Checking cluster"}</span>
              </div>
            </article>

            <article className="metric-card">
              <div className="metric-card__top">
                <span className="metric-icon metric-icon--green">
                  <Database size={18} />
                </span>
                <span
                  className={`metric-trend ${overview ? "metric-trend--positive" : ""}`}
                >
                  {overview && <Check size={13} />}
                  {overview ? "Connected" : "Checking"}
                </span>
              </div>
              <p className="metric-label">Redis status</p>
              <div className="metric-value metric-value--text">
                {overview?.redis_status ?? "Checking"}
              </div>
              <div className="metric-footnote">
                <span className="metric-footnote__dot" />
                <span>Counter &amp; event stream online</span>
              </div>
            </article>

            <article className="metric-card">
              <div className="metric-card__top">
                <span className="metric-icon metric-icon--amber">
                  <GitBranch size={18} />
                </span>
                <span className="metric-trend">Runtime</span>
              </div>
              <p className="metric-label">Application version</p>
              <div className="metric-value metric-value--text">
                {overview?.app_version ?? "—"}
              </div>
              <div className="metric-footnote">
                <span className="version-pill">API</span>
                <span>GitOps-managed workload</span>
              </div>
            </article>
          </section>

          {view !== "workloads" && (
            <section className="panel traffic-panel">
              <div className="panel-heading">
                <div>
                  <div className="panel-title-row">
                    <h2>{view === "activity" ? "Traffic activity" : "Request activity"}</h2>
                    <span className="range-pill">LAST 60 MIN</span>
                  </div>
                  <p>Visit events recorded by the application</p>
                </div>
                <div className="chart-legend">
                  <span className="legend-dot" />
                  Visits
                </div>
              </div>
              <Suspense fallback={<div className="chart-empty">Loading chart…</div>}>
                <VisitChart points={history} detailed={view === "activity"} />
              </Suspense>
              <div className="chart-footer">
                <span>
                  <span className="live-pulse live-pulse--small" />
                  Live data · refreshes every 15 seconds
                </span>
                <span>Prometheus metrics: <code>/metrics</code></span>
              </div>
            </section>
          )}

          {view !== "activity" && (
            <section className="panel workloads-panel">
              <div className="panel-heading">
                <div>
                  <div className="panel-title-row">
                    <h2>Deployments</h2>
                    {cluster?.available && (
                      <span className="count-pill">{cluster.deployments.length}</span>
                    )}
                  </div>
                  <p>
                    {cluster?.available
                      ? `Namespace · ${cluster.namespace}`
                      : "Live workload state from the Kubernetes API"}
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setView("workloads")}
                  type="button"
                >
                  View workloads <ArrowUpRight size={14} />
                </button>
              </div>
              <WorkloadsPanel cluster={cluster} />
            </section>
          )}

          {view === "workloads" && (
            <section className="panel workloads-panel">
              <div className="panel-heading">
                <div>
                  <div className="panel-title-row">
                    <h2>Workload health</h2>
                    <span className="range-pill">
                      {cluster?.available ? cluster.status.toUpperCase() : "NO CLUSTER"}
                    </span>
                  </div>
                  <p>
                    Kubernetes API · namespace{" "}
                    <code>{cluster?.namespace ?? "default"}</code>
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => void refresh()}
                  type="button"
                >
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>
              <WorkloadsPanel cluster={cluster} />
              {cluster?.deployments.some((workload) => workload.pods.length > 0) && (
                <div className="pod-table-wrap">
                  <table className="pod-table">
                    <thead>
                      <tr>
                        <th>Pod</th>
                        <th>Workload</th>
                        <th>Status</th>
                        <th>Restarts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cluster.deployments.flatMap((workload) =>
                        workload.pods.map((pod) => (
                          <tr key={pod.name}>
                            <td className="pod-name">
                              <span className={pod.ready ? "pod-ready" : "pod-waiting"} />
                              {pod.name}
                            </td>
                            <td>{workload.name}</td>
                            <td>{pod.phase}</td>
                            <td>{pod.restarts}</td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          <footer className="page-footer">
            <span>
              <ShieldCheck size={14} />
              Read-only cluster access
            </span>
            <span>
              <ArrowDownRight size={13} />
              Metrics and workload data are collected from your own cluster.
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
