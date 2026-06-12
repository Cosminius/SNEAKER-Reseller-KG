"""FastAPI server for the Sneaker KG frontend.

It does two simple things:
  1. serves the static files (index.html, style.css, app.js)
  2. forwards the GraphDB calls, so the browser talks to a single origin
     and no CORS configuration is needed

Install once:  pip install fastapi uvicorn httpx
Start:         python server.py        ->  http://localhost:5500
"""

import httpx
import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.staticfiles import StaticFiles

GRAPHDB = "http://localhost:7200"  # where GraphDB listens

app = FastAPI()
graphdb = httpx.AsyncClient(base_url=GRAPHDB, timeout=300)


async def forward(request: Request, path: str) -> Response:
    """Re-send the incoming request to GraphDB and return GraphDB's reply."""
    headers = {}
    for name in ("content-type", "accept"):
        if name in request.headers:
            headers[name] = request.headers[name]

    reply = await graphdb.request(
        method=request.method,
        url=path,
        content=await request.body(),
        headers=headers,
    )
    return Response(
        content=reply.content,
        status_code=reply.status_code,
        media_type=reply.headers.get("content-type"),
    )


@app.post("/repositories/{repo}")
async def sparql_query(repo: str, request: Request):
    """SPARQL endpoint: SELECT / ASK / DESCRIBE / CONSTRUCT."""
    return await forward(request, f"/repositories/{repo}")


@app.post("/rest/chat/chats")
async def open_chat(request: Request):
    """TTYG: open a new chat with an agent."""
    return await forward(request, "/rest/chat/chats")


@app.post("/rest/chat/chats/question")
async def ask_question(request: Request):
    """TTYG: ask the question; the agent's answer comes back in 'messages'."""
    return await forward(request, "/rest/chat/chats/question")


@app.get("/rest/chat/conversations/{conversation_id}")
async def read_conversation(conversation_id: str, request: Request):
    """TTYG: re-read a conversation (fallback used by app.js)."""
    return await forward(request, f"/rest/chat/conversations/{conversation_id}")


# everything that is not an API route above is a static file from this folder
app.mount("/", StaticFiles(directory=".", html=True), name="frontend")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5500)
