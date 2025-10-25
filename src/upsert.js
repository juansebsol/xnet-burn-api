const { supabase } = require('./supabase');

async function upsertBurnEvents(burnEvents) {
  if (!burnEvents || burnEvents.length === 0) {
    return { inserted: 0, updated: 0, upserted: 0, skipped: 0 };
  }

  console.log(`Processing ${burnEvents.length} burn events...`);

  let inserted = 0;
  let updated = 0;
  let upserted = 0;
  let skipped = 0;

  for (const event of burnEvents) {
    try {
      // First check if this burn already exists
      const { data: existingData, error: checkError } = await supabase
        .from('burn_events')
        .select('signature')
        .eq('signature', event.signature)
        .maybeSingle();

      if (checkError) {
        console.error(`Error checking existing burn event ${event.signature}:`, checkError);
        continue;
      }

      if (existingData) {
        console.log(`Burn event ${event.signature} already exists - skipping`);
        skipped++;
        continue;
      }

      // Burn doesn't exist, insert it
      const { data, error } = await supabase
        .from('burn_events')
        .insert({
          signature: event.signature,
          timestamp: event.timestamp,
          action: event.action,
          from_address: event.from_address,
          to_address: event.to_address,
          amount: event.amount,
          token: event.token,
          scrape_time: event.scrape_time
        })
        .select();

      if (error) {
        console.error(`Error inserting burn event ${event.signature}:`, error);
        continue;
      }

      if (data && data.length > 0) {
        console.log(`New burn event inserted: ${event.signature}`);
        inserted++;
        upserted++;
      }
    } catch (err) {
      console.error(`Exception processing burn event ${event.signature}:`, err);
    }
  }

  console.log(`Processing complete: inserted=${inserted} skipped=${skipped} total_processed=${upserted + skipped}`);
  return { inserted, updated, upserted, skipped };
}

async function logBurnRun(runData) {
  const {
    totalChecked,
    newBurns,
    success,
    errorText,
    executionTimeMs,
    notes
  } = runData;

  try {
    const { error } = await supabase
      .from('burn_tracker_logs')
      .insert({
        total_checked: totalChecked || 0,
        new_burns: newBurns || 0,
        success: success || false,
        error_text: errorText || null,
        execution_time_ms: executionTimeMs || 0,
        notes: notes || null
      });

    if (error) {
      console.error('Failed to log burn run:', error);
    } else {
      console.log('Burn run logged successfully');
    }
  } catch (err) {
    console.error('Exception logging burn run:', err);
  }
}

module.exports = {
  upsertBurnEvents,
  logBurnRun
};
