# AI Runtime Server

The **AI Runtime Server** is the Retrieval-Augmented Generation (RAG) runtime responsible for answering user questions using embedded documentation and large language models.

It connects a chat interface to a semantic search system backed by **pgvector**, retrieves relevant documentation, and generates answers using an LLM.

This repository acts as the **runtime layer** between the user interface and the knowledge system.

---

# What This Repository Does

This service performs the full **RAG pipeline**:

```
User Question
│
▼
Generate Query Embedding
│
▼
Vector Similarity Search (pgvector)
│
▼
Retrieve Relevant Documentation
│
▼
Construct Context
│
▼
Send Context + Question to LLM
│
▼
Generate Answer
│
▼
Return Answer + Citations
```

The runtime exposes a simple API used by the chat interface.

---

# System Architecture

This repository sits in the middle of the system.

```
runtime-ui
│
▼
ai-runtime-server
│
▼
Postgres + pgvector
│
▼
Embedded documentation
```

Full system architecture:

```
runtime-ui
│
▼
ai-runtime-server
│
▼
AI Control Plane Runtime
│
▼
rag-mdn ingestion pipeline
│
▼
pgvector database
```

---

# RAG Retrieval Pipeline

The runtime performs **hybrid retrieval** using vector similarity and text ranking.

```
User Query
│
▼
Embedding Generation
(OpenAI text-embedding-3-small)
│
▼
Vector Similarity Search
(pgvector)
│
▼
Full Text Ranking
(Postgres ts_rank)
│
▼
Retrieve Top-K Document Chunks
│
▼
Context Assembly
│
▼
LLM Generation (Claude)
```

The resulting answer includes **citations back to the original documentation sources**.

---

# API

## Health Check

**GET /** 

Response:

```json
{
  "status": "ok",
  "service": "ai-runtime-server"
}
```

---

## Semantic Search

**POST /search**

Request:

```json
{
  "query": "javascript closures"
}
```

Response:

```json
[
  {
    "text": "...documentation snippet...",
    "source": "closures/index.md"
  }
]
```

Used primarily for debugging retrieval behavior.

---

## Chat Endpoint

**POST /chat**

Request:

```json
{
  "query": "What is a JavaScript closure?"
}
```

Response:

```json
{
  "answer": "A JavaScript closure is...",
  "sources": [
    {
      "title": "closures",
      "url": "https://developer.mozilla.org/en-US/docs/closures/",
      "excerpt": "A closure is..."
    }
  ]
}
```

This endpoint performs the full **RAG reasoning pipeline**.

---

# Repository Structure

```
.
├─ server.ts
├─ package.json
├─ tsconfig.json
└─ .env
```

| File | Purpose |
|------|---------|
| `server.ts` | Main runtime server |
| `package.json` | Dependencies and scripts |
| `.env` | Environment configuration |

---

# Environment Variables

Create a `.env` file with the following values:

```
DATABASE_URL=postgresql://example:example@localhost:5455/example
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
```

---

# Running Locally

Start the database:

```bash
docker compose up
```

Start the runtime server:

```bash
npx tsx server.ts
```

Server will run at:

**http://localhost:3000**

---

# Example Query

```bash
curl localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"query":"What is a JavaScript closure?"}'
```

---

# Related Repositories

This runtime is part of a modular system.

| Repository | Purpose |
|------------|---------|
| control-plane | agent runtime architecture |
| ai-runtime-server | RAG runtime and chat API |
| rag-mdn | documentation ingestion and embeddings |
| runtime-ui | chat interface demo |

System architecture:

```
runtime-ui
│
▼
ai-runtime-server
│
▼
control-plane
│
▼
rag-mdn
│
▼
pgvector database
```

---

# Future Improvements

Potential enhancements:

### Streaming Responses

Enable streaming token output for real-time responses.

### Multi-Model Support

Support multiple model providers:

- Claude
- GPT
- Gemini

### Improved Retrieval

Add additional ranking strategies:

- BM25
- reranking models
- hybrid search

### Observability

Add logging and tracing for runtime monitoring.

---

# Summary

The AI Runtime Server provides a minimal but complete **RAG runtime implementation**.

Key features:

- semantic vector search
- hybrid retrieval
- LLM orchestration
- source citation generation
- simple chat API

This runtime connects the **user interface** to the **knowledge system** and powers the agent responses.
