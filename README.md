# XNET Burn Data Tracker

Automated micro-worker that tracks burn events for the XNET token wallet and provides a public API.

## Features

- **Burn Event Tracking**: Monitors Solana wallet `B9SXSuPwpzmYUgk1GRfuW9R9QDMJ6P9SfTybSoawHiLj` for burn transactions
- **Database Storage**: Stores burn events in Supabase with audit logging
- **Public API**: Vercel-hosted API for accessing burn data
- **Scheduled Execution**: GitHub Actions workflow with configurable intervals
- **Duplicate Prevention**: Signature-based uniqueness to prevent duplicate entries

## Quick Start

### 1. Environment Setup

Copy `env.sample` to `.env` and configure:

```bash
cp env.sample .env
```

Required variables:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `RPC_URL` - Solana RPC endpoint
- `TARGET_WALLET` - Wallet to monitor (default: B9SXSuPwpzmYUgk1GRfuW9R9QDMJ6P9SfTybSoawHiLj)

### 2. Database Setup

Run this SQL in your Supabase SQL editor:

```sql
-- Burn events table
CREATE TABLE burn_events (
  id SERIAL PRIMARY KEY,
  signature TEXT UNIQUE NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  action TEXT NOT NULL DEFAULT 'Burn',
  from_address TEXT NOT NULL,
  to_address TEXT,
  amount BIGINT NOT NULL,
  value_usd DECIMAL(18,8),
  token TEXT NOT NULL,
  scrape_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit log table
CREATE TABLE burn_tracker_logs (
  id SERIAL PRIMARY KEY,
  run_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  total_checked INTEGER DEFAULT 0,
  new_burns INTEGER DEFAULT 0,
  success BOOLEAN NOT NULL,
  error_text TEXT,
  execution_time_ms INTEGER
);

-- Indexes for performance
CREATE INDEX idx_burn_events_signature ON burn_events(signature);
CREATE INDEX idx_burn_events_timestamp ON burn_events(timestamp DESC);
CREATE INDEX idx_burn_tracker_logs_run_time ON burn_tracker_logs(run_time DESC);
```

### 3. Local Testing

```bash
npm install
npm run burn:once
```

### 4. GitHub Actions Setup

1. Add secrets to your GitHub repository:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RPC_URL`
   - `TARGET_WALLET`

2. The workflow runs every 24 hours by default (configurable via `BURN_TRACKER_INTERVAL_HOURS`)

### 5. API Deployment (Optional)

Deploy to Vercel for public API access:

1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy

## API Endpoints

| Endpoint | Description | Example |
|----------|-------------|---------|
| `/api/latest` | Most recent burn event | `/api/latest` |
| `/api/history?limit=10` | Last N burn events | `/api/history?limit=10` |
| `/api/history?start=2025-01-01&end=2025-01-31` | Date range | `/api/history?start=2025-01-01&end=2025-01-31` |
| `/api/all` | All burn events (paginated) | `/api/all?page=1&limit=50` |

## Response Format

```json
{
  "signature": "5J7X...abc123",
  "timestamp": "2025-01-24T10:30:00.000Z",
  "action": "Burn",
  "from_address": "B9SXSuPwpzmYUgk1GRfuW9R9QDMJ6P9SfTybSoawHiLj",
  "to_address": null,
  "amount": "1000000000",
  "token": "XNET",
  "scrape_time": "2025-01-24T10:35:00.000Z"
}
```

## Configuration

Environment variables for customization:

- `BURN_TRACKER_INTERVAL_HOURS` - Hours between runs (default: 24)
- `MAX_RPC_RETRIES` - RPC retry attempts (default: 3)
- `BATCH_SIZE` - Transaction batch size (default: 10)
- `LOG_LEVEL` - Logging level (default: info)

## Architecture

```
GitHub Actions (Scheduler)
    ↓
Burn Detection Logic
    ↓
Supabase Database
    ↓
Vercel API (Public Access)
```

## Troubleshooting

- **RPC Errors**: Increase `MAX_RPC_RETRIES` or use a different RPC endpoint
- **Database Errors**: Verify Supabase credentials and table schema
- **No Burn Events**: Check if the target wallet has recent transactions
- **API 500 Errors**: Verify Vercel environment variables

## Dependencies

- `@solana/web3.js` - Solana blockchain interaction
- `@supabase/supabase-js` - Database operations
- `dotenv` - Environment management
