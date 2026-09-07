import os
from flask import Flask

app = Flask(__name__)
VERSION = os.environ.get("APP_VERSION", "v1")


@app.route("/")
def hello():
    return f"Hello from the DevOps weekend project! Version: {VERSION}\n"


@app.route("/healthz")
def healthz():
    return "ok\n"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
