import os
from flask import Flask
import redis

app = Flask(__name__)
VERSION = os.environ.get("APP_VERSION", "v3")

redis_host = os.environ.get("REDIS_HOST", "redis")
redis_port = int(os.environ.get("REDIS_PORT", 6379))
redis_password = os.environ.get("REDIS_PASSWORD")

r = redis.Redis(host=redis_host, port=redis_port, password=redis_password, decode_responses=True)


@app.route("/")
def hello():
    count = r.incr("visits")
    return f"Hello from the DevOps weekend project! Version: {VERSION}. Visit count: {count}\n"


@app.route("/healthz")
def healthz():
    try:
        r.ping()
        return "ok\n"
    except redis.exceptions.RedisError:
        return "redis unreachable\n", 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)