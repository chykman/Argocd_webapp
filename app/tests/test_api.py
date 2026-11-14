import fakeredis
import pytest
from fastapi.testclient import TestClient

from app import main


@pytest.fixture
def api_client(monkeypatch):
    fake_redis = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(main, "get_redis_client", lambda: fake_redis)
    monkeypatch.delenv("KUBERNETES_SERVICE_HOST", raising=False)
    with TestClient(main.app) as client:
        yield client, fake_redis


def test_overview_starts_with_zero_visits(api_client):
    client, _ = api_client

    response = client.get("/api/overview")

    assert response.status_code == 200
    assert response.json()["total_visits"] == 0
    assert response.json()["redis_status"] == "Healthy"


def test_recording_visits_updates_total_and_history(api_client):
    client, _ = api_client

    first_visit = client.post("/api/visits")
    second_visit = client.post("/api/visits")
    history = client.get("/api/visits/history")

    assert first_visit.json()["total_visits"] == 1
    assert second_visit.json()["total_visits"] == 2
    assert sum(point["visits"] for point in history.json()["points"]) == 2


def test_liveness_and_readiness_endpoints(api_client):
    client, _ = api_client

    assert client.get("/livez").json() == {"status": "ok"}
    assert client.get("/readyz").json() == {"status": "ok"}


def test_readiness_fails_when_redis_is_unavailable(api_client, monkeypatch):
    client, _ = api_client

    class UnavailableRedis:
        def ping(self):
            raise main.redis.exceptions.ConnectionError("connection refused")

    monkeypatch.setattr(main, "get_redis_client", lambda: UnavailableRedis())

    response = client.get("/readyz")

    assert response.status_code == 503
    assert response.json()["detail"] == "Redis is unavailable"


def test_cluster_status_is_explicitly_unavailable_outside_kubernetes(api_client):
    client, _ = api_client

    response = client.get("/api/deployments")

    assert response.status_code == 200
    assert response.json()["available"] is False
    assert response.json()["deployments"] == []
