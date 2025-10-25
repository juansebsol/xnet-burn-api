require('dotenv').config();
const { BurnTracker } = require('./burnTracker');

(async () => {
  try {
    console.log('Testing burn detection logic...');
    
    const tracker = new BurnTracker();
    console.log('Target wallet:', tracker.targetWallet.toString());
    console.log('RPC URL:', tracker.connection.rpcEndpoint);
    
    // Test with a small number of transactions
    const result = await tracker.trackBurns(10);
    
    console.log('\n=== Test Results ===');
    console.log('Success:', result.success);
    console.log('Total checked:', result.totalChecked);
    console.log('Burn events found:', result.burnEvents.length);
    
    if (result.burnEvents.length > 0) {
      console.log('\n=== Burn Events ===');
      result.burnEvents.forEach((event, index) => {
        console.log(`\n${index + 1}. ${event.signature}`);
        console.log(`   Time: ${event.timestamp}`);
        console.log(`   Amount: ${event.amount}`);
        console.log(`   From: ${event.from_address}`);
        console.log(`   Token: ${event.token}`);
      });
    } else {
      console.log('\nNo burn events found in recent transactions.');
    }
    
    if (result.error) {
      console.log('\nError:', result.error);
    }
    
  } catch (err) {
    console.error('Test failed:', err);
    process.exitCode = 1;
  }
})();
