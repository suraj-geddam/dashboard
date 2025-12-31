# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DashBoard is a Next.js application for analyzing DoorDash order history. Users upload CSV exports of their order data, which is stored in a SQLite database. The app provides visual analytics (charts, KPIs) and natural language querying powered by LLMs.

## Development Commands

```bash
npm run dev          # Start development server (localhost:3000)
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Run ESLint
npm test             # Run all tests
npm run test:unit    # Run unit tests only
npm run test:e2e     # Run E2E tests (requires dev server running)
npm run test:watch   # Run tests in watch mode
```

## Architecture

### Database Layer (`lib/db.ts`)

- Uses `better-sqlite3` for synchronous SQLite operations
- Database file: `data/dashboard.db`
- Singleton pattern for dev hot-reloading (global instance in dev, new instance in prod)
- WAL mode enabled for concurrent read/write performance

**Schema:**
- `orders`: Aggregated order data (id, created_at, store_name, delivery_time, delivery_address, total_amount)
- `order_items`: Individual items per order (id, order_id, item_name, category, unit_price, quantity, subtotal)
- `store_metadata`: LLM-enriched store metadata (store_name PK, cuisine_type, store_category, price_range, enriched_at, enrichment_source, raw_llm_response)
- `config`: Key-value store for LLM settings (provider, base_url, api_key, model)

### Data Flow

1. **Upload** (`/upload` page → `/api/upload`):
   - Parses DoorDash CSV using PapaParse
   - Groups rows by `CREATED_AT` to form complete orders
   - **Deletes all existing data** before inserting (full replace on each upload)
   - Uses transactions for atomic bulk inserts

2. **Dashboard** (`/` page → `/api/dashboard`):
   - Fetches aggregated stats: total spend, order count, top stores, monthly trends, category distribution
   - All calculations done via SQL queries

3. **Store Metadata Enrichment** (`/upload` page → `/api/enrich`):
   - After upload, user clicks "Enrich Metadata" button
   - Server-Sent Events (SSE) streams real-time progress
   - Finds unenriched stores via LEFT JOIN
   - Batches stores (25 per call) for LLM classification
   - LLM classifies: cuisine_type, store_category, price_range
   - Inserts metadata via transaction, continues on batch failures
   - Progress events: `start`, `progress`, `complete`, `error`

4. **Natural Language Query** (`/query` page → `/api/query`):
   - User asks question in natural language
   - SSE streams query generation and execution in real-time
   - LLM converts question to SQL using enhanced schema + few-shot examples
   - Few-shot examples demonstrate store_metadata JOINs
   - Executes generated SELECT query against database
   - Stream events: `generating`, `sql`, `executing`, `results`, `error`
   - Backward-compatible POST endpoint also available

5. **Settings** (`/settings` page → `/api/config`):
   - Configure LLM provider (base URL, API key, model name)
   - Stored in `config` table

### LLM Integration

- Uses OpenAI SDK with custom `baseURL` for flexibility (supports LMStudio, Ollama, etc.)
- Default: `http://localhost:8080/v1` with `llama-3.2-3b-instruct`
- **Enrichment**: Batch classification with structured JSON output (cuisine, category, price)
- **Query**: Enhanced schema with store_metadata + 5 few-shot examples showing metadata JOINs
- LLM responses are cleaned (strips markdown) and validated
- Enrichment uses fallback defaults on parsing failures

### UI Structure

- Root layout (`app/layout.tsx`): Sidebar navigation with 4 pages
- Styling: Tailwind CSS with DoorDash red accent (`#FF3008`)
- Charts: Recharts library for bar/pie charts
- Path alias: `@/*` maps to project root

## Key Implementation Details

- **Database transactions**: All multi-row inserts use prepared statements + transactions
- **CSV parsing**: Groups rows by timestamp to handle multi-item orders
- **LLM prompting**: Schema + few-shot examples injected; strict output rules to ensure SQL-only responses
- **Error handling**: API routes return proper HTTP status codes; UI shows loading states
- **SSE streaming**: Real-time progress for enrichment and query operations
- **Enrichment batching**: 25 stores per LLM call for optimal performance with 3B models

## Store Metadata Enrichment System

### Purpose
Solves semantic query accuracy problems. Without metadata, queries like "How much did I spend on Thai food?" incorrectly filter on `order_items.category` (which contains "Appetizer", "Entree") instead of restaurant cuisine.

### Architecture
- **Utility functions** (`lib/enrichment-utils.js`):
  - `buildEnrichmentPrompt(storeNames)`: Generates batch classification prompt
  - `parseEnrichmentResponse(responseText, storeNames)`: Parses JSON with fallback handling

- **API endpoint** (`/api/enrich`):
  - SSE streaming endpoint
  - Queries unenriched stores via LEFT JOIN
  - Batches stores (25 per call) for LLM classification
  - Uses transactions for atomic inserts
  - Continues on batch failures (logs and moves to next batch)

- **UI flow** (`/upload` page):
  - "Enrich Metadata" button appears after upload success
  - EventSource connects to `/api/enrich`
  - Progress bar shows: X/Y stores processed (Z enriched)
  - Handles: `start`, `progress`, `error`, `complete` events

### Metadata Fields
- `cuisine_type`: Restaurant cuisine (e.g., "Thai", "Italian"), null for non-restaurants
- `store_category`: Business type ("Restaurant", "Grocery", "Pharmacy", "Fast Food", etc.)
- `price_range`: Price tier ("$", "$$", "$$$", "$$$$")

### Re-enrichment Strategy
Only enriches stores not in `store_metadata` table (LEFT JOIN WHERE NULL). Manual corrections persist.

## Testing Infrastructure

### Unit Tests (`tests/`)
- **`enrich.test.js`**: Tests for enrichment utility functions
  - Prompt formatting
  - JSON parsing (valid, markdown artifacts, invalid, partial)

- **`database.test.js`**: Tests for store_metadata CRUD operations
  - Insert, upsert, indexes, NULL handling

### Test Configuration
- Jest with CommonJS modules
- Test fixtures in `tests/fixtures/test-orders.csv`
- Run: `npm run test:unit` (fast, no LLM required)

### Test Coverage
- Enrichment prompt building and response parsing
- Database schema validation and operations
- E2E tests deferred (would require running dev server + LLM)

## Data Directory

The `data/` directory contains:
- `dashboard.db`: SQLite database file
- `consumer_order_details.csv`: Sample DoorDash export (CSV format expected by upload)
- Database WAL files (`-shm`, `-wal`)

This directory must exist before first run.

## Migration Scripts

- `scripts/add-store-metadata-table.js`: One-time migration to add store_metadata table
- `scripts/init-db.js`: Full database initialization (includes store_metadata)

Run migration if upgrading existing database:
```bash
node scripts/add-store-metadata-table.js
```
