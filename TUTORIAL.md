# Tutorial — How to Run and Demo the Project

## 1. What you need

- **GraphDB Desktop 11.x** running on <http://localhost:7200>
- **Python 3.10+**, then once: `pip install fastapi uvicorn httpx`
- A **Google Gemini API key** configured in GraphDB (properties: `graphdb.llm.api = gemini`,
  `graphdb.llm.model = gemini-2.5-flash-lite`, `graphdb.llm.api-key = <key>`)

## 2. Run the app (when GraphDB is already set up)

```
python server.py
```

Open <http://localhost:5500>. `server.py` serves the page and forwards `/repositories` and
`/rest` to GraphDB, so no CORS configuration is needed anywhere.

In the dropdown at the top you pick how your message is answered:

| Mode | What happens |
|------|--------------|
| Agent with vector search | LLM agent that can also search the `sneaker_text` similarity index |
| Agent without vector search | LLM agent that only writes SPARQL |
| Plain graph — SPARQL query | your message is executed directly as SPARQL |

In SPARQL mode the four buttons (SELECT / ASK / DESCRIBE / CONSTRUCT) load ready-made demo
queries. Enter sends, Shift+Enter makes a new line.

## 3. Setting up GraphDB from scratch (new machine)

1. Create a repository named **`refine`** and import the files from `models/`
   (`clean_refine_full.ttl`, `sneaker-model.ttl`; import `additional-classes.ttl` into the
   named graph `http://sneakerproject.org/ontology` — the agents read the schema from there).
2. Create the **text similarity index** (the new Workbench has no Similarity page, so run
   this in the SPARQL editor on the `refine` repository):

   ```sparql
   PREFIX :<http://www.ontotext.com/graphdb/similarity/>
   PREFIX inst:<http://www.ontotext.com/graphdb/similarity/instance/>

   INSERT {
       inst:sneaker_text :createIndex "-termweight idf" ;
                         :analyzer "org.apache.lucene.analysis.en.EnglishAnalyzer" ;
                         :documentID ?documentID .
       ?documentID :documentText ?documentText .
   } WHERE {
       SELECT ?documentID ?documentText {
           ?documentID ?p ?documentText .
           FILTER (isLiteral(?documentText))
       }
   }
   ```

3. Create **two TTYG agents** (Lab → Talk to Your Graph), both on repository `refine`,
   model `gemini-2.5-flash-lite`, temperature 0, with these instructions:

   ```
   Always begin SPARQL queries with: PREFIX : <http://sneakerproject.org#>
   Brand and Region individuals have NO rdfs:label. Never query rdfs:label.
   Use IRIs directly, e.g. ?sale :ofBrand :brand_Yeezy .
   Keep queries simple: one SELECT with GROUP BY. Avoid UNION and subqueries.
   Example, average sale price per brand:
   PREFIX : <http://sneakerproject.org#>
   SELECT ?brand (AVG(?p) AS ?avg)
   WHERE { ?s :ofBrand ?brand ; :salePrice ?p . }
   GROUP BY ?brand
   ```

   - Agent 1: only **SPARQL search** enabled (ontology graph `http://sneakerproject.org/ontology`).
   - Agent 2: SPARQL search **plus Semantic similarity search** on index `sneaker_text` (threshold 0.4).
4. Open <http://localhost:7200/rest/chat/agents> and copy the two `id` values into the
   constants `AGENT_ID_PLAIN` / `AGENT_ID_VECTOR` at the top of `app.js`.

## 4. Demo script

1. SPARQL mode: run the four presets (brand statistics table, ASK → true,
   DESCRIBE of `:sale_0`, CONSTRUCT of derived `:madeBy` triples).
2. Ask **both agents** an aggregation question, e.g. *"What is the average sale price for
   the Yeezy brand?"* — both answer correctly (~360).
3. Ask **both agents** a similarity question, e.g. *"Which sneakers are similar to the
   Yeezy Boost 350 Beluga?"* — only the vector agent answers well. This shows exactly
   what vector search adds on top of SPARQL.

## 5. Troubleshooting

- Red bubble *"are GraphDB and server.py both running?"* → start GraphDB Desktop and/or `python server.py`.
- Agent answers *"Request failed due to an error"* → usually the Gemini API is overloaded (HTTP 503
  in `%APPDATA%\GraphDB\logs\error.log`); wait a minute and re-ask. SPARQL mode always works — it never touches the LLM.
- Recreated the agents? Their ids changed — update the two constants in `app.js` (step 3.4).
