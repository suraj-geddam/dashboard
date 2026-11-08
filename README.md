# DashBoard

> **Experimental.** I built this with AI coding tools to see what I could do with them. It's not maintained; it's left up as part of the history of me building stuff with AI.

A local web app for digging through your DoorDash order history. Upload the `consumer_order_details.csv` that DoorDash gives you when you request your data, and you get:

- **A dashboard:** total spend, order count, top stores, monthly spend and a category breakdown, with per-year tabs and year-over-year changes.
- **Store enrichment:** an LLM classifies each store's cuisine, type (restaurant, grocery, pharmacy…) and price range, so "how much did I spend on Thai food?" actually works.
- **Questions in plain English:** a chat page where an LLM answers by running read-only SQL against your orders, streaming its tool calls and the answer.

Everything stays on your machine in a SQLite file (`data/dashboard.db`). The LLM can be a local model behind any OpenAI-compatible server (I used Qwen3 8B on llama.cpp) or a hosted one through OpenRouter.

## Running it

```bash
npm install
node scripts/init-db.js   # creates data/dashboard.db
npm run dev               # http://localhost:3000
```

Then:

1. On **Settings**, point it at your LLM: a local llama-server URL (e.g. `http://localhost:8080/v1`) or OpenRouter with an API key, plus a model name.
2. On **Upload**, add your CSV, then click **Enrich Metadata**. Each upload replaces all existing data.
3. Look at the dashboard, or ask questions on **Query**.

Unit tests: `npm run test:unit`.

Built with Next.js, SQLite (better-sqlite3), Recharts and the OpenAI SDK. Not affiliated with DoorDash.
