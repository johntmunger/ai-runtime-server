import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import cors from "cors";
import "dotenv/config";

import { orchestrate } from "../ai-control-plane/src/runtime/orchestrator";
import { executeKernel } from "../ai-control-plane/src/runtime/kernel";
import { createTrace } from "../ai-control-plane/src/runtime/trace";

import { initTools } from "../ai-control-plane/src/tools/init";

/*
--------------------------------------------------
Environment
--------------------------------------------------
*/

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is missing in .env");
}

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is missing in .env");
}

/*
--------------------------------------------------
Express Setup
--------------------------------------------------
*/

const app = express();

app.use(cors());
app.use(express.json());

initTools();

/*
--------------------------------------------------
LLM Clients (optional future use)
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
Health Check
--------------------------------------------------
*/

const SERVER_VERSION = "v0.1-agent-runtime";

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "ai-runtime-server",
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    version: SERVER_VERSION,
    timestamp: Date.now(),
  });
});

/*
--------------------------------------------------
Shared Answer Extraction (FIXED)
--------------------------------------------------
*/

function extractAnswer(result: any): string {
  // 1. Tool / system error
  if ("error" in result && result.error) {
    const messages = result.error?.message;
    if (Array.isArray(messages) && messages.length) {
      return messages
        .map((m: any) => m?.text)
        .filter(Boolean)
        .join("\n");
    }
    return result.error?.details ?? "error";
  }

  // 2. Chat result (second pass)
  if (result?.type === "chat") {
    return result.content ?? "error";
  }

  // 3. Tool result (first pass)
  if (result?.result) {
    const r = result.result;

    if (typeof r === "object" && "result" in r) {
      return String(r.result);
    }

    return JSON.stringify(r);
  }

  return "error";
}

/*
--------------------------------------------------
Agent Debug Endpoint (GET)
--------------------------------------------------
*/

app.get("/agent", async (_req, res) => {
  try {
    const trace = createTrace();

    const kernelInput = await orchestrate("Add 2 and 3", trace);

    let result = await executeKernel(kernelInput, trace);

    // 🔁 second pass (tool → chat)
    if ("result" in result && result.tool) {
      const chatInput = {
        type: "chat" as const,
        message: JSON.stringify(result.result, null, 2),
      };

      result = await executeKernel(chatInput, trace);
    }

    const answer = extractAnswer(result);

    res.json({
      answer,
      trace: trace.events,
    });
  } catch (error) {
    console.error("Agent GET error:", error);

    res.status(500).json({
      error: "Agent execution failed",
    });
  }
});

/*
--------------------------------------------------
Agent Endpoint (POST)
--------------------------------------------------
*/

app.post("/agent", async (req, res) => {
  try {
    console.log("RAW BODY:", req.body);

    const { query } = req.body;

    console.log("QUERY:", query);

    if (!query) {
      return res.status(400).json({
        error: "Query is required",
      });
    }

    const trace = createTrace();

    const kernelInput = await orchestrate(query, trace);

    let result = await executeKernel(kernelInput, trace);

    // 🔁 second pass (tool → chat)
    if ("result" in result && result.tool) {
      const chatInput = {
        type: "chat" as const,
        message: JSON.stringify(result.result, null, 2),
      };

      result = await executeKernel(chatInput, trace);
    }

    const answer = extractAnswer(result);

    res.json({
      answer,
      trace: trace.events,
    });
  } catch (error) {
    console.error("Agent error:", error);

    res.status(500).json({
      error: "Agent execution failed",
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
  console.log(`🚀 Runtime Server ${SERVER_VERSION} running`);
});
