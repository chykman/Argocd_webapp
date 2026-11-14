export interface Overview {
  app_name: string;
  app_version: string;
  redis_status: string;
  total_visits: number;
  updated_at: string;
}

export interface HistoryPoint {
  time: string;
  visits: number;
}

export interface WorkloadPod {
  name: string;
  phase: string;
  ready: boolean;
  restarts: number;
}

export interface Workload {
  name: string;
  desired_replicas: number;
  ready_replicas: number;
  image: string;
  pods: WorkloadPod[];
}

export interface ClusterSnapshot {
  available: boolean;
  namespace: string;
  status: string;
  deployments: Workload[];
  message: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${path}`);
  }

  return response.json() as Promise<T>;
}

export const getOverview = () => request<Overview>("/api/overview");
export const getHistory = () =>
  request<{ window_minutes: number; points: HistoryPoint[] }>(
    "/api/visits/history",
  );
export const getDeployments = () =>
  request<ClusterSnapshot>("/api/deployments");
export const recordVisit = () =>
  request<{ total_visits: number }>("/api/visits", { method: "POST" });
