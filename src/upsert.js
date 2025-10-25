const { supabase } = require('./supabase');

async function upsertBurnEvents(burnEvents) {
  if (!burnEvents || burnEvents.length === 0) {
    return { inserted: 0, updated: 0, upserted: 0 };
  }

  console.log(`Upserting ${burnEvents.length} burn events...`);

  let inserted = 0;
  let updated = 0;
  let upserted = 0;

  for (const event of burnEvents) {
    try {
      const { data, error } = await supabase
        .from('burn_events')
        .upsert(
          {
            signature: event.signature,
            timestamp: event.timestamp,
            action: event.action,
            from_address: event.from_address,
            to_address: event.to_address,
            amount: event.amount,
            token: event.token,
            scrape_time: event.scrape_time
          },
          {
            onConflict: 'signature',
            ignoreDuplicates: false
          }
        )
        .select();

      if (error) {
        console.error(`Error upserting burn event ${event.signature}:`, error);
        continue;
      }

      if (data && data.length > 0) {
        // Check if this was an insert or update by looking at created_at vs updated_at
        // For simplicity, we'll assume it's an insert if we get data back
        inserted++;
        upserted++;
      }
    } catch (err) {
      console.error(`Exception upserting burn event ${event.signature}:`, err);
    }
  }

  console.log(`Upsert complete: inserted=${inserted} updated=${updated} total=${upserted}`);
  return { inserted, updated, upserted };
}

async function logBurnRun(runData) {
  const {
    totalChecked,
    newBurns,
    success,
    errorText,
    executionTimeMs
  } = runData;

  try {
    const { error } = await supabase
      .from('burn_tracker_logs')
      .insert({
        total_checked: totalChecked || 0,
        new_burns: newBurns || 0,
        success: success || false,
        error_text: errorText || null,
        execution_time_ms: executionTimeMs || 0
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
