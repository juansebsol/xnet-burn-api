require('dotenv').config();
const { BurnTracker } = require('./burnTracker');
const { upsertBurnEvents, logBurnRun } = require('./upsert');

(async () => {
  const startTime = Date.now();
  
  try {
    console.log('Starting XNET Burn Tracker...');
    
    const tracker = new BurnTracker();
    const result = await tracker.trackBurns(100); // Check last 100 transactions
    
    if (result.success) {
      const { inserted, updated, upserted } = await upsertBurnEvents(result.burnEvents);
      
      await logBurnRun({
        totalChecked: result.totalChecked,
        newBurns: result.burnEvents.length,
        success: true,
        executionTimeMs: Date.now() - startTime
      });

      console.log(
        `Burn tracking OK: checked=${result.totalChecked} burns=${result.burnEvents.length} inserted=${inserted} updated=${updated} (wrote=${upserted})`
      );
    } else {
      await logBurnRun({
        totalChecked: result.totalChecked,
        newBurns: 0,
        success: false,
        errorText: result.error,
        executionTimeMs: Date.now() - startTime
      });

      console.error('Burn tracking FAILED:', result.error);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Burn tracking FAILED:', err);
    
    try {
      await logBurnRun({
        totalChecked: 0,
        newBurns: 0,
        success: false,
        errorText: String(err?.message ?? err),
        executionTimeMs: Date.now() - startTime
      });
    } catch (logErr) {
      console.error('Failed to log burn tracking error:', logErr);
    }
    
    process.exitCode = 1;
  }
})();
