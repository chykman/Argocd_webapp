# Pulseboard · GitOps Observatory

A small platform engineering demo with a live React dashboard, FastAPI service,
Redis visit telemetry, Kubernetes workload status, and a security-focused
GitHub Actions pipeline.

## What it does

- Shows the Redis-backed visit counter and the last hour of visit activity.
- Reads API and frontend Deployment/Pod readiness from the Kubernetes API using
  a namespace-scoped, read-only ServiceAccount.
- Exposes Prometheus-format HTTP request metrics at `/metrics`.
- Refreshes dashboard data every 15 seconds and supports recording test traffic.
- Builds and scans immutable API and UI container images in CI.

## Run locally

Docker Compose starts Redis, the API, and the UI:

```sh
docker compose up --build
```

Open [http://localhost:8081](http://localhost:8081). Stop the stack with
`docker compose down`.

The local API is proxied through the UI at `/api`. Redis uses a local-only
development password by default. Override it with `REDIS_PASSWORD` when needed.

## Test and scan locally

```sh
pip install -r app/requirements-dev.txt
python -m pytest -q app/tests
ruff check app
bandit -r app --severity-level medium --confidence-level medium
pip-audit --requirement app/requirements-dev.txt

npm ci --prefix frontend
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend audit --omit=dev
```

## Deploy to the local k3d cluster

Build and import both images into a running k3d cluster:

```sh
docker build -t argo_webapp-api:latest ./app
docker build -t argo_webapp-ui:latest ./frontend
k3d image import -c argocd-test argo_webapp-api:latest argo_webapp-ui:latest
kubectl apply -f k8s/
kubectl rollout status deployment/redis
kubectl rollout status deployment/api
kubectl rollout status deployment/webapp
```

Forward the UI service to a free local port:

```sh
kubectl port-forward svc/webapp 8501:80
```

Open [http://localhost:8501](http://localhost:8501). The frontend readiness
endpoint is `/healthz`; the API readiness endpoint is `/readyz`.

`k8s/redis-secret.yaml` contains a demo password for local testing only. Replace
it with a managed secret before deploying to a shared or production cluster.
The sample Redis Deployment is intentionally ephemeral and is not configured
for production persistence or high availability.

## GitOps and container publishing

The Argo CD Application syncs `k8s/`. The CI workflow publishes API and UI
images to GHCR using immutable `sha-<commit>` tags after tests, security scans,
and DAST pass. For a remote cluster, update the image references in
`k8s/api-deployment.yaml` and `k8s/deployment.yaml` to the published GHCR tags,
then commit those changes so Argo CD can sync them. Local k3d uses the image
names shown above.

## Security pipeline

Pull requests and pushes to `main` run:

- Python tests, Ruff, Bandit SAST, and `pip-audit` dependency checks.
- TypeScript lint/build and npm dependency audit.
- CodeQL analysis for Python and JavaScript/TypeScript.
- Trivy scans of both built container images for high and critical issues.
- OWASP ZAP baseline DAST scans against an isolated Docker Compose stack,
  covering both the UI and API.

The ZAP baseline scan is intentionally limited to this project’s ephemeral CI
environment; it does not scan external or production targets.
The UI revalidates its HTML and caches fingerprinted assets, while API responses
are marked `no-store`; the API scan profile ignores only ZAP’s corresponding
non-storable-content alert.
