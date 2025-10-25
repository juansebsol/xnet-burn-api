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
      const { inserted, updated, upserted, skipped } = await upsertBurnEvents(result.burnEvents);
      
      // Create detailed notes about the run
      const notes = `Checked ${result.totalChecked} transactions, found ${result.burnEvents.length} burns: ${inserted} new, ${skipped} already existed. Total processed: ${upserted + skipped}`;
      
      await logBurnRun({
        totalChecked: result.totalChecked,
        newBurns: result.burnEvents.length,
        success: true,
        executionTimeMs: Date.now() - startTime,
        notes: notes
      });

      console.log(
        `Burn tracking OK: checked=${result.totalChecked} burns_found=${result.burnEvents.length} inserted=${inserted} skipped=${skipped} (total_processed=${upserted + skipped})`
      );
    } else {
      const notes = `Failed after checking ${result.totalChecked} transactions. Error: ${result.error}`;
      
      await logBurnRun({
        totalChecked: result.totalChecked,
        newBurns: 0,
        success: false,
        errorText: result.error,
        executionTimeMs: Date.now() - startTime,
        notes: notes
      });

      console.error('Burn tracking FAILED:', result.error);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Burn tracking FAILED:', err);
    
    try {
      const notes = `Exception occurred during burn tracking. Error: ${String(err?.message ?? err)}`;
      
      await logBurnRun({
        totalChecked: 0,
        newBurns: 0,
        success: false,
        errorText: String(err?.message ?? err),
        executionTimeMs: Date.now() - startTime,
        notes: notes
      });
    } catch (logErr) {
      console.error('Failed to log burn tracking error:', logErr);
    }
    
    process.exitCode = 1;
  }
})();
