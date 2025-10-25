# Configuration Guide

## Transaction Check Limit

**File:** `src/runOnce.js` (line 12)
```javascript
const result = await tracker.trackBurns(100); // Change this number
```

## Schedule Configuration

**File:** `.github/workflows/burn-tracker.yml` (line 6)
```yaml
- cron: '0 */24 * * *'  # Change this
```

## Environment Variables

**File:** `.env`
```bash
TARGET_WALLET=your_wallet_address
TOKEN_ACCOUNT=your_token_account_address
RPC_URL=your_rpc_endpoint
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key
```

## Database Schema

**File:** `utils/supabase-db-setup.sql`
Run this SQL in Supabase to create required tables.