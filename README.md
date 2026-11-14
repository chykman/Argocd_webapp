# Pulseboard · GitOps Observatory

A small platform engineering demo that combines a React dashboard, a FastAPI
API, Redis-backed telemetry, Kubernetes readiness checks, and Argo CD GitOps
management.

## What we achieved

This project now demonstrates a working local stack and a GitOps deployment flow:

- A Docker Compose environment for local app testing.
- A FastAPI service with Redis-backed visit metrics and health endpoints.
- A React frontend that displays overview data and visit history.
- Kubernetes manifests for API, Redis, and frontend deployment.
- Argo CD installation and configuration for syncing the project from Git.
- A working local k3d deployment flow for validating Kubernetes behavior.
- Troubleshooting and stabilization of the frontend pod when NGINX required
  writable filesystem paths at runtime.

## Architecture summary

- Frontend: React + Vite + NGINX
- API: FastAPI
- Data store: Redis
- GitOps: Argo CD
- Cluster target: local k3d cluster

## Local testing with Docker Compose

Run the application locally:

```bash
cd /workspaces/Argocd_webapp
docker compose up --build
```

Then open:

- http://localhost:8081

Stop the stack with:

```bash
docker compose down
```

The frontend proxies the API at `/api`. Redis uses a local development password by
default and can be overridden with `REDIS_PASSWORD` if needed.

## Automated project validation

Run the repo's checks before testing in Kubernetes:

```bash
cd /workspaces/Argocd_webapp

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

These checks cover:

- FastAPI test suite
- Python linting and security scanning
- Dependency auditing
- Frontend linting and build validation
- JavaScript dependency auditing

## Deploy to a local k3d cluster

Build and import both images into a running k3d cluster:

```bash
docker build -t argo_webapp-api:latest ./app
docker build -t argo_webapp-ui:latest ./frontend
k3d image import -c argocd-test argo_webapp-api:latest argo_webapp-ui:latest
kubectl apply -f k8s/
kubectl rollout status deployment/redis
kubectl rollout status deployment/api
kubectl rollout status deployment/webapp
```

Then forward the UI service locally:

```bash
kubectl port-forward svc/webapp 8501:80
```

Open:

- http://localhost:8501

The frontend readiness endpoint is `/healthz` and the API readiness endpoint is
`/readyz`.

## Argo CD setup and access

Install Argo CD in the cluster:

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

Wait for the server to become ready:

```bash
kubectl -n argocd rollout status deployment/argocd-server --timeout=180s
```

Get the initial admin password:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d
```

Expose the UI locally:

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Then open:

- https://localhost:8080

Login with:

- Username: admin
- Password: the value returned from the command above

## Create the Argo CD application

Use the app manifest in `argocd/application.yaml` or the equivalent values below:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: argo-webapp
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/chykman/Argocd_webapp.git
    targetRevision: HEAD
    path: k8s
  destination:
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

In the Argo CD UI, fill in these values:

- Application name: argo-webapp
- Project: default
- Repository URL: https://github.com/chykman/Argocd_webapp.git
- Revision: HEAD
- Path: k8s
- Cluster: https://kubernetes.default.svc
- Namespace: default
- Sync policy: automated, prune, self-heal

## GitOps testing workflow

1. Make a change in the repo.
2. Push it to your GitHub repository or fork.
3. Argo CD watches the repository and compares Git state with the live cluster.
4. Click Sync in the Argo CD UI or let automated sync handle it.
5. Validate the app by checking pods and the deployed frontend.

Useful commands:

```bash
kubectl get pods -n default
kubectl get svc -n default
kubectl get application -n argocd
kubectl logs -n default deploy/api
kubectl logs -n default deploy/redis
```

## Troubleshooting notes

During deployment, the frontend container initially failed because NGINX attempted
to create temporary runtime files on a read-only filesystem. The symptom was:

- CrashLoopBackOff
- error: `mkdir() "/var/cache/nginx/fastcgi_temp" failed (30: Read-only file system)`

This was resolved by ensuring the frontend container was not forced to run with a
read-only root filesystem and by mounting a writable temporary directory for NGINX
runtime state.

The deployment manifest currently uses a safe pattern for this image:

- readOnlyRootFilesystem is disabled for the frontend container
- `/tmp` is mounted from an `emptyDir` volume

This allows NGINX startup scripts and runtime temp directories to function without
crashing.

## Security and CI notes

The project includes security-focused automation for CI:

- Python tests, linting, and security scans
- Frontend lint and build validation
- Dependency audits
- Security scanning of images and application behavior

The app also uses a demo Redis secret for local development and an intentionally
simple Kubernetes configuration for a local cluster.

## Final notes

This repository is a complete example of:

- local application testing
- Kubernetes deployment validation
- GitOps synchronization with Argo CD
- health and readiness validation
- a practical troubleshooting workflow for real cluster deployment issues

It is ready for further extension as a real GitOps project for staging or
production environments.
