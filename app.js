// ======================= configuration =======================

// GraphDB base URL. Empty string = same origin: server.py forwards
// /repositories and /rest to GraphDB, so the browser needs no CORS.
const GRAPHDB_URL = "";

// GraphDB repository id
const REPO = "refine";

// TTYG agent ids (listed by GET /rest/chat/agents)
const AGENT_ID_VECTOR = "bf3bc9d6-d756-421a-a994-4f7352332c93"; // agent WITH vector search (similarity index "sneaker_text")
const AGENT_ID_PLAIN = "7ea25948-fb46-467b-80cd-a64a5b3a20b8";  // agent WITHOUT vector search (SPARQL only)

// Base path of the TTYG REST API
const TTYG_BASE = `${GRAPHDB_URL}/rest/chat`;

// Demo queries loaded by the four preset buttons (SPARQL mode)
const PRESET_SELECT = `PREFIX : <http://sneakerproject.org#>
SELECT ?brand (COUNT(?sale) AS ?sales) (ROUND(AVG(?price)) AS ?avgPrice) (MAX(?price) AS ?maxPrice)
WHERE {
  ?sale a :Sale ;
        :ofBrand ?brand ;
        :salePrice ?price .
}
GROUP BY ?brand
ORDER BY DESC(?avgPrice)`;

const PRESET_ASK = `PREFIX : <http://sneakerproject.org#>
ASK {
  ?sale a :Sale ;
        :salePrice ?price .
  FILTER(?price > 1000)
}`;

const PRESET_DESCRIBE = `PREFIX : <http://sneakerproject.org#>
DESCRIBE :sale_0`;

const PRESET_CONSTRUCT = `PREFIX : <http://sneakerproject.org#>
CONSTRUCT { ?sneaker :madeBy ?brand }
WHERE {
  ?sale :soldSneaker ?sneaker ;
        :ofBrand ?brand .
}
LIMIT 50`;

// ======================= small helpers =======================

const $ = (id) => document.getElementById(id);
const chat = $("chat");
const input = $("input");
const modeSelect = $("mode");
const sendButton = $("btn-send");

function scrollToBottom() { chat.scrollTop = chat.scrollHeight; }

// add a chat bubble ("user" or "bot") and return it
function addBubble(role, extraClass) {
  const div = document.createElement("div");
  div.className = `msg ${role}${extraClass ? " " + extraClass : ""}`;
  chat.appendChild(div);
  scrollToBottom();
  return div;
}

// show preformatted text (Turtle, raw JSON, error bodies) in a bubble
function showPre(bubble, text) {
  const pre = document.createElement("pre");
  pre.textContent = text;
  bubble.replaceChildren(pre);
}

// show an error message in a bubble
function showError(bubble, text) {
  bubble.classList.add("error");
  bubble.textContent = text;
}

// grow the input box with its content (chat-style)
function autoResize() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
}

// ======================= GraphDB calls =======================

// Run a SPARQL query: SELECT/ASK come back as JSON, DESCRIBE/CONSTRUCT as Turtle.
async function runSparql(query, bubble) {
  const keyword = query.replace(/^\s*#.*$/gm, "").match(/\b(SELECT|ASK|DESCRIBE|CONSTRUCT)\b/i);
  const isRdf = keyword && ["DESCRIBE", "CONSTRUCT"].includes(keyword[1].toUpperCase());

  try {
    const response = await fetch(`${GRAPHDB_URL}/repositories/${REPO}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/sparql-query",
        "Accept": isRdf ? "text/turtle" : "application/sparql-results+json",
      },
      body: query,
    });
    if (!response.ok) {
      showError(bubble, `HTTP ${response.status} — ${await response.text()}`);
    } else if (isRdf) {
      showPre(bubble, (await response.text()).trim() || "(empty result)");
    } else {
      const json = await response.json();
      if (typeof json.boolean === "boolean") bubble.textContent = `ASK result: ${json.boolean}`;
      else renderTable(json.results.bindings, bubble);
    }
  } catch (err) {
    showError(bubble, `Request failed: ${err.message} — are GraphDB and server.py both running?`);
  }
}

// Render SELECT results as a table: one column per variable, one row per result.
function renderTable(bindings, bubble) {
  if (!bindings || bindings.length === 0) { bubble.textContent = "No results."; return; }

  const columns = [...new Set(bindings.flatMap((b) => Object.keys(b)))];
  const table = document.createElement("table");

  const header = table.createTHead().insertRow();
  for (const col of columns) {
    const th = document.createElement("th");
    th.textContent = col;
    header.appendChild(th);
  }

  const body = table.createTBody();
  for (const binding of bindings) {
    const row = body.insertRow();
    for (const col of columns) {
      row.insertCell().textContent = binding[col] ? binding[col].value : "";
    }
  }

  const count = document.createElement("p");
  count.textContent = `${bindings.length} result${bindings.length === 1 ? "" : "s"}`;
  bubble.replaceChildren(count, table);
}

// Ask a TTYG agent: 1) open a chat, 2) send the question.
// The answer is the last "assistant" message of the returned conversation.
async function askAgent(question, useVector, bubble) {
  const agentId = useVector ? AGENT_ID_VECTOR : AGENT_ID_PLAIN;
  if (!agentId) return showError(bubble, "Agent id is missing in app.js.");

  try {
    const chatResponse = await fetch(`${TTYG_BASE}/chats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    });
    if (!chatResponse.ok) return showError(bubble, `HTTP ${chatResponse.status} — ${await chatResponse.text()}`);
    const chat = await chatResponse.json();
    const conversationId = chat.conversationId || chat.id;

    const response = await fetch(`${TTYG_BASE}/chats/question`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        agentId,
        question,
        tzOffset: -new Date().getTimezoneOffset(),
      }),
    });
    if (!response.ok) return showError(bubble, `HTTP ${response.status} — ${await response.text()}`);
    const data = await response.json();

    let answer = extractAnswer(data);
    if (!answer) {
      const conv = await fetch(`${TTYG_BASE}/conversations/${conversationId}`);
      if (conv.ok) answer = extractAnswer(await conv.json());
    }
    if (answer) bubble.textContent = answer;
    else showPre(bubble, JSON.stringify(data, null, 2)); // unexpected shape — show the raw JSON
  } catch (err) {
    showError(bubble, `Request failed: ${err.message} — are GraphDB and server.py both running?`);
  }
}

// Take the text of the last "assistant" message, or null if there is none.
function extractAnswer(data) {
  if (typeof data === "string") return data;
  if (!data || !Array.isArray(data.messages)) return null;
  const answers = data.messages.filter(
    (m) => String(m.role || "").toLowerCase() === "assistant" && m.message
  );
  return answers.length ? answers[answers.length - 1].message : null;
}

// ======================= chat flow =======================

// Send the input: add a user bubble and a placeholder bot bubble, then fill it.
async function send() {
  const text = input.value.trim();
  if (!text || sendButton.disabled) return;
  const mode = modeSelect.value; // "vector" | "plain" | "sparql"

  addBubble("user", mode === "sparql" ? "code" : "").textContent = text;
  input.value = "";
  autoResize();

  const bubble = addBubble("bot");
  bubble.textContent = mode === "sparql" ? "Running query…" : "Thinking…";
  sendButton.disabled = true;
  try {
    if (mode === "sparql") await runSparql(text, bubble);
    else await askAgent(text, mode === "vector", bubble);
  } finally {
    sendButton.disabled = false;
    scrollToBottom();
    input.focus();
  }
}

// Adapt the placeholder, the monospace font and the preset buttons to the mode.
function applyMode() {
  const sparql = modeSelect.value === "sparql";
  $("presets").hidden = !sparql;
  input.classList.toggle("code", sparql);
  input.placeholder = sparql
    ? "Write a SPARQL query or load a preset above — Shift+Enter for a new line"
    : "Ask a question about the graph…";
}

// ======================= events =======================

sendButton.addEventListener("click", send);
input.addEventListener("input", autoResize);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
});
modeSelect.addEventListener("change", applyMode);

const presetMap = {
  "btn-preset-select": PRESET_SELECT,
  "btn-preset-ask": PRESET_ASK,
  "btn-preset-describe": PRESET_DESCRIBE,
  "btn-preset-construct": PRESET_CONSTRUCT,
};
for (const [id, preset] of Object.entries(presetMap)) {
  $(id).addEventListener("click", () => { input.value = preset; autoResize(); input.focus(); });
}

applyMode();
addBubble("bot").textContent =
  "Hi! Pick a mode above: ask the LLM agent (with or without vector search) or query the graph directly with SPARQL.";
input.focus();
