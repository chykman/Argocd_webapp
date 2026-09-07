# DevOps Weekend Project — starter files

These files accompany the full step-by-step guide. Drop them into an empty
folder on your host machine and follow the guide from Milestone 2 onward.

- `Vagrantfile`, `provision.sh` — the single VM (Docker + k3s + local registry + argocd CLI)
- `app/` — the sample Flask web app that gets containerized
- `k8s/` — the Deployment + Service manifests (this folder becomes your GitOps repo path)
- `argocd/application.yaml` — the Argo CD Application pointing at your GitHub repo

See the full guide for exact commands and verification steps at each milestone.
