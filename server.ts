import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import cors from "cors";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import "dotenv/config";

/*
--------------------------------------------------
Environment
--------------------------------------------------
*/

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing in .env");
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is missing in .env");
}

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is missing in .env");
}

console.log("DATABASE_URL:", process.env.DATABASE_URL);

/*
--------------------------------------------------
Express Setup
--------------------------------------------------
*/

const app = express();

app.use(cors());
app.use(express.json());

/*
--------------------------------------------------
Database
--------------------------------------------------
*/

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

/*
--------------------------------------------------
LLM Clients
--------------------------------------------------
*/

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/*
--------------------------------------------------
Embedding Function
--------------------------------------------------
*/

async function embedQuery(query: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });

  const embedding = response.data[0].embedding;

  // Trim to match pgvector column size (1024)
  return embedding.slice(0, 1024);
}

/*
--------------------------------------------------
Health Check
--------------------------------------------------
*/

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "ai-runtime-server",
  });
});

/*
--------------------------------------------------
Debug Endpoint (Vector Search Only)
--------------------------------------------------
*/

app.post("/search", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        error: "Query is required",
      });
    }

    const embedding = await embedQuery(query);

    const results = await db.execute(sql`
      SELECT text, source
      FROM document_embeddings
      ORDER BY embedding <-> ${sql.raw(`'[${embedding.join(",")}]'::vector`)}
      LIMIT 30
    `);

    const rows = results as any[];
    res.json(rows);
  } catch (error) {
    console.error("Search error:", error);

    res.status(500).json({
      error: "Search failed",
    });
  }
});

/*
--------------------------------------------------
Chat Endpoint (Full RAG Pipeline)
--------------------------------------------------
*/

app.post("/chat", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        error: "Query is required",
      });
    }

    /*
    Step 1 — Embed Query
    */

    const embedding = await embedQuery(query);

    /*
    Step 2 — Hybrid Retrieval
    */

    const results = await db.execute(sql`
        SELECT text, source
        FROM document_embeddings
        ORDER BY
          ts_rank(
            to_tsvector('english', text),
            plainto_tsquery('english', ${query})
          ) DESC,
          embedding <-> ${sql.raw(`'[${embedding.join(",")}]'::vector`)}
        LIMIT 40
      `);

    const rows = results as any[];

    if (!rows.length) {
      return res.json({
        answer: "No relevant documentation was found.",
        sources: [],
      });
    }

    /*
    Step 3 — Build Context
    */

    const context = rows
      .map((row, i) => `Source ${i + 1} (${row.source}):\n${row.text}`)
      .join("\n\n");

    /*
    Step 4 — Claude Reasoning
    */

    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: `
You are an expert JavaScript assistant.

Answer the question using the documentation context below.
If multiple sections are relevant, combine them into a clear explanation.
If the answer cannot be found in the context, say so.

Context:
${context}

Question:
${query}
          `,
        },
      ],
    });

    const message = response.content[0];
    const answer = message.type === "text" ? message.text : "";

    const sources = [
      ...new Map(
        rows.map((r) => [
          r.source,
          {
            title: r.source
              .replace("/index.md", "")
              .split("/")
              .pop()
              ?.replace(/_/g, " "),
            url: `https://developer.mozilla.org/en-US/docs/Web/JavaScript/${r.source.replace("/index.md", "")}`,
            excerpt: r.text.slice(0, 180),
          },
        ]),
      ).values(),
    ].slice(0, 5);

    res.json({
      answer,
      sources,
    });
  } catch (error) {
    console.error("Chat error:", error);

    res.status(500).json({
      error: "Chat failed",
    });
  }
});

/*
--------------------------------------------------
Server
--------------------------------------------------
*/

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`AI runtime running on http://localhost:${PORT}`);
});
