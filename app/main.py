import os
import time
import uuid
from datetime import UTC, datetime
from functools import lru_cache

import redis
from fastapi import FastAPI, HTTPException, Response
from kubernetes import client as kube_client
from kubernetes import config as kube_config
from kubernetes.client.exceptions import ApiException
from kubernetes.config.config_exception import ConfigException
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

APP_VERSION = os.environ.get("APP_VERSION", "dev")
VISIT_EVENTS_KEY = "visits:events"
VISITS_TOTAL_KEY = "visits"
VISIT_RETENTION_SECONDS = 24 * 60 * 60
HISTORY_BUCKETS = 12
HISTORY_BUCKET_SECONDS = 5 * 60

REQUEST_COUNT = Counter(
    "http_requests_total",
    "HTTP requests handled by the dashboard API.",
    ("method", "path", "status"),
)
REQUEST_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds.",
    ("method", "path"),
)

app = FastAPI(
    title="GitOps Observatory API",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@lru_cache(maxsize=1)
def get_redis_client() -> redis.Redis:
    return redis.Redis(
        host=os.environ.get("REDIS_HOST", "redis"),
        port=int(os.environ.get("REDIS_PORT", "6379")),
        password=os.environ.get("REDIS_PASSWORD"),
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
        health_check_interval=30,
    )


@app.middleware("http")
async def record_http_metrics(request, call_next):
    started_at = time.perf_counter()
    status_code = "500"
    try:
        response = await call_next(request)
        status_code = str(response.status_code)
        return response
    finally:
        REQUEST_COUNT.labels(
            request.method, request.url.path, status_code
        ).inc()
        REQUEST_DURATION.labels(request.method, request.url.path).observe(
            time.perf_counter() - started_at
        )


def get_redis_or_503() -> redis.Redis:
    client = get_redis_client()
    try:
        client.ping()
    except redis.exceptions.RedisError as exc:
        raise HTTPException(status_code=503, detail="Redis is unavailable") from exc
    return client


def cluster_snapshot() -> dict:
    namespace = os.environ.get("POD_NAMESPACE", "default")
    if not os.environ.get("KUBERNETES_SERVICE_HOST"):
        return {
            "available": False,
            "namespace": namespace,
            "status": "Unavailable",
            "deployments": [],
            "message": "Workload details are available when deployed in Kubernetes.",
        }

    try:
        kube_config.load_incluster_config()
    except ConfigException:
        return {
            "available": False,
            "namespace": namespace,
            "status": "Unavailable",
            "deployments": [],
            "message": "In-cluster Kubernetes configuration is unavailable.",
        }

    try:
        deployments = kube_client.AppsV1Api().list_namespaced_deployment(
            namespace,
            label_selector="app.kubernetes.io/part-of=gitops-observatory",
        ).items
        pods = kube_client.CoreV1Api().list_namespaced_pod(
            namespace,
            label_selector="app.kubernetes.io/part-of=gitops-observatory",
        ).items
    except ApiException as exc:
        return {
            "available": False,
            "namespace": namespace,
            "status": "Unavailable",
            "deployments": [],
            "message": f"Kubernetes API request failed: {exc.reason}",
        }

    workload_summaries = []
    for deployment in deployments:
        name = deployment.metadata.name
        matching_pods = [
            pod
            for pod in pods
            if (pod.metadata.labels or {}).get("app.kubernetes.io/name") == name
        ]
        desired = deployment.spec.replicas or 0
        ready = deployment.status.ready_replicas or 0
        workload_summaries.append(
            {
                "name": name,
                "desired_replicas": desired,
                "ready_replicas": ready,
                "image": deployment.spec.template.spec.containers[0].image,
                "pods": [
                    {
                        "name": pod.metadata.name,
                        "phase": pod.status.phase or "Unknown",
                        "ready": all(
                            status.ready
                            for status in (pod.status.container_statuses or [])
                        ),
                        "restarts": sum(
                            status.restart_count
                            for status in (pod.status.container_statuses or [])
                        ),
                    }
                    for pod in matching_pods
                ],
            }
        )

    healthy = bool(workload_summaries) and all(
        workload["ready_replicas"] >= workload["desired_replicas"]
        for workload in workload_summaries
    )
    return {
        "available": True,
        "namespace": namespace,
        "status": "Healthy" if healthy else "Progressing",
        "deployments": workload_summaries,
        "message": None,
    }


@app.get("/livez")
def livez() -> dict:
    return {"status": "ok"}


@app.get("/readyz")
def readyz() -> dict:
    get_redis_or_503()
    return {"status": "ok"}


@app.get("/api/overview")
def overview() -> dict:
    client = get_redis_or_503()
    total_visits = int(client.get(VISITS_TOTAL_KEY) or 0)
    return {
        "app_name": "GitOps Observatory",
        "app_version": APP_VERSION,
        "redis_status": "Healthy",
        "total_visits": total_visits,
        "updated_at": datetime.now(UTC).isoformat(),
    }


@app.post("/api/visits")
def record_visit() -> dict:
    client = get_redis_or_503()
    now = time.time()
    event_id = f"{now:.6f}:{uuid.uuid4()}"
    pipeline = client.pipeline(transaction=True)
    pipeline.incr(VISITS_TOTAL_KEY)
    pipeline.zadd(VISIT_EVENTS_KEY, {event_id: now})
    pipeline.zremrangebyscore(VISIT_EVENTS_KEY, 0, now - VISIT_RETENTION_SECONDS)
    total_visits, _, _ = pipeline.execute()
    return {"total_visits": total_visits}


@app.get("/api/visits/history")
def visit_history() -> dict:
    client = get_redis_or_503()
    now = time.time()
    start = now - HISTORY_BUCKETS * HISTORY_BUCKET_SECONDS
    pipeline = client.pipeline(transaction=False)
    for index in range(HISTORY_BUCKETS):
        bucket_start = start + index * HISTORY_BUCKET_SECONDS
        bucket_end = bucket_start + HISTORY_BUCKET_SECONDS
        pipeline.zcount(VISIT_EVENTS_KEY, bucket_start, f"({bucket_end}")
    counts = pipeline.execute()
    points = [
        {
            "time": datetime.fromtimestamp(
                start + index * HISTORY_BUCKET_SECONDS, UTC
            ).strftime("%H:%M"),
            "visits": count,
        }
        for index, count in enumerate(counts)
    ]
    return {"window_minutes": 60, "points": points}


@app.get("/api/deployments")
def deployments() -> dict:
    return cluster_snapshot()


@app.get("/metrics")
def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
