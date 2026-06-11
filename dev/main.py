#!/usr/bin/env python3
"""Ask the GraphDB TTYG agent a question, print the answer.

Usage:
    python ask_agent.py
    python ask_agent.py Which region has the most sales?
"""

import sys
import requests

BASE = "http://localhost:7201"
DEFAULT_QUESTION = "What is the most sold sneaker?"


def ask(question: str) -> str:
    agent_id = requests.get(f"{BASE}/rest/chat/agents", timeout=30).json()[0]["id"]

    chat = requests.post(f"{BASE}/rest/chat/chats",
                         json={"agentId": agent_id}, timeout=60).json()
    conversation_id = chat.get("conversationId") or chat.get("id")

    r = requests.post(f"{BASE}/rest/chat/chats/question",
                      json={"conversationId": conversation_id,
                            "agentId": agent_id,
                            "question": question,
                            "tzOffset": 180},
                      timeout=180)

    data = r.json()
    if isinstance(data, str):
        return f"Error from GraphDB: {data}"

    def extract(d):
        if not isinstance(d, dict):
            return None
        msgs = [m["message"] for m in d.get("messages", [])
                if str(m.get("role", "")).upper() == "ASSISTANT" and m.get("message")]
        return msgs[-1] if msgs else None

    answer = extract(data)
    if not answer:
        conv = requests.get(f"{BASE}/rest/chat/conversations/{conversation_id}",
                            timeout=30).json()
        answer = extract(conv)
    return answer or f"No answer. Agent status: {data.get('name', 'unknown')}"


if __name__ == "__main__":
    question = " ".join(sys.argv[1:]) or DEFAULT_QUESTION
    print("Q:", question)
    print("A:", ask(question))