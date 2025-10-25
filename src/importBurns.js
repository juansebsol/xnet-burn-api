require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const { upsertBurnEvents } = require('./upsert');

class BurnImporter {
  constructor() {
    this.connection = new Connection(process.env.RPC_URL || 'https://api.mainnet-beta.solana.com');
    this.maxRetries = parseInt(process.env.MAX_RPC_RETRIES) || 3;
  }

  async fetchTransaction(signature, retries = 0) {
    while (retries < this.maxRetries) {
      try {
        const transaction = await this.connection.getTransaction(signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        });
        
        if (!transaction) {
          throw new Error('Transaction not found');
        }
        
        return transaction;
      } catch (error) {
        console.error(`Error fetching transaction ${signature} (attempt ${retries + 1}/${this.maxRetries}):`, error.message);
        
        if (retries >= this.maxRetries - 1) {
          console.error(`Failed to fetch transaction ${signature} after ${this.maxRetries} attempts`);
          return null;
        }
        
        retries++;
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 100));
      }
    }
  }

  isBurnTransaction(transaction, signature) {
    if (!transaction || !transaction.meta) {
      console.log(`    Meta: No transaction meta data`);
      return { isBurn: false };
    }

    const { meta } = transaction;
    console.log(`    Meta: Transaction has meta data`);
    
    // Check transaction logs for burn instructions
    if (meta.logMessages && meta.logMessages.length > 0) {
      console.log(`    Log Messages: ${meta.logMessages.length} found`);
      
      let foundBurnInstruction = false;
      for (const logMessage of meta.logMessages) {
        console.log(`    Log: ${logMessage}`);
        
        // Look for burn instruction logs - be very specific
        if (logMessage.includes('Program log: Instruction: Burn') || 
            logMessage.includes('Program log: Instruction: BurnChecked')) {
          console.log(`    🔥 BURN INSTRUCTION FOUND in logs!`);
          foundBurnInstruction = true;
          break;
        }
      }
      
      if (foundBurnInstruction) {
        // Get burn amount from token balance changes
        const burnAmount = this.getBurnAmountFromBalances(meta);
        if (burnAmount.amount > 0) {
          console.log(`    Burn amount confirmed: ${burnAmount.amount} tokens`);
          return {
            isBurn: true,
            amount: burnAmount.amount,
            mint: burnAmount.mint,
            decimals: burnAmount.decimals,
            fromAccount: burnAmount.owner
          };
        } else {
          console.log(`    Burn instruction found but no amount detected`);
        }
      }
    } else {
      console.log(`    Log Messages: No log messages found`);
    }
    
    return { isBurn: false };
  }

  getBurnAmountFromBalances(meta) {
    if (!meta.preTokenBalances || !meta.postTokenBalances) {
      return { amount: 0 };
    }

    const preBalances = meta.preTokenBalances;
    const postBalances = meta.postTokenBalances;
    
    console.log(`    Analyzing token balance changes for burn amount...`);
    
    // Look for token balance decreases that indicate burns
    for (const preBalance of preBalances) {
      const postBalance = postBalances.find(
        post => post.accountIndex === preBalance.accountIndex && 
                post.mint === preBalance.mint
      );
      
      if (postBalance) {
        const preAmount = parseInt(preBalance.uiTokenAmount.amount);
        const postAmount = parseInt(postBalance.uiTokenAmount.amount);
        
        console.log(`    Account ${preBalance.accountIndex}: ${preAmount} -> ${postAmount} (${preBalance.mint})`);
        
        if (preAmount > postAmount) {
          const decreaseAmount = preAmount - postAmount;
          console.log(`    Decrease detected: ${decreaseAmount} tokens`);
          
          // For burns, the account should have significantly less tokens or be completely empty
          // Check if this looks like a burn (significant decrease or account emptied)
          const isSignificantBurn = decreaseAmount >= preAmount * 0.9; // 90% or more decrease
          
          if (isSignificantBurn) {
            console.log(`    Significant burn detected: ${decreaseAmount} tokens (${preBalance.mint})`);
            return {
              amount: decreaseAmount,
              mint: preBalance.mint,
              decimals: preBalance.uiTokenAmount.decimals,
              owner: preBalance.owner
            };
          } else {
            console.log(`    Decrease too small to be a burn: ${decreaseAmount} < ${preAmount * 0.9}`);
          }
        }
      } else {
        // Account disappeared completely - this is likely a burn
        const preAmount = parseInt(preBalance.uiTokenAmount.amount);
        console.log(`    Account ${preBalance.accountIndex} disappeared completely: ${preAmount} tokens (${preBalance.mint})`);
        
        if (preAmount > 0) {
          return {
            amount: preAmount,
            mint: preBalance.mint,
            decimals: preBalance.uiTokenAmount.decimals,
            owner: preBalance.owner
          };
        }
      }
    }
    
    return { amount: 0 };
  }

  async importBurns(signatures) {
    console.log(`Importing ${signatures.length} burn transactions...`);
    
    const burnEvents = [];
    
    for (const signature of signatures) {
      console.log(`\n🔍 Processing: ${signature}`);
      
      const transaction = await this.fetchTransaction(signature);
      if (!transaction) {
        console.log(`❌ Failed to fetch transaction: ${signature}`);
        continue;
      }
      
      const burnResult = this.isBurnTransaction(transaction, signature);
      
      if (burnResult.isBurn) {
        console.log(`\n🔥 TXN: ${signature}`);
        console.log(`    Status: BURN DETECTED!`);
        console.log(`    Amount: ${burnResult.amount}`);
        console.log(`    Mint: ${burnResult.mint}`);
        console.log(`    From: ${burnResult.fromAccount}`);
        
        burnEvents.push({
          signature: signature,
          timestamp: new Date(transaction.blockTime * 1000).toISOString(),
          action: 'Burn',
          from_address: burnResult.fromAccount,
          to_address: null, // Burns don't have a recipient
          amount: burnResult.amount.toString(),
          token: 'XNET',
          scrape_time: new Date().toISOString()
        });
      } else {
        console.log(`\n✅ TXN: ${signature}`);
        console.log(`    Status: Not a burn transaction`);
      }
    }
    
    if (burnEvents.length > 0) {
      console.log(`\n📊 Import Summary:`);
      console.log(`    Total processed: ${signatures.length}`);
      console.log(`    Burns found: ${burnEvents.length}`);
      
      const { inserted, updated, upserted, skipped } = await upsertBurnEvents(burnEvents);
      
      console.log(`\n💾 Database Results:`);
      console.log(`    Inserted: ${inserted}`);
      console.log(`    Skipped: ${skipped}`);
      console.log(`    Total processed: ${upserted + skipped}`);
    } else {
      console.log(`\n❌ No burn events found in the provided transactions`);
    }
    
    return burnEvents;
  }
}

// Main execution
(async () => {
  const signatures = [
    '22Qaj6yfn2Pg2rcsCRAT4jHZuQ4QUq3uN1gH7GKuNrHEe7ZarxSiqwnzJgtLUnf16Z4MgVpMm9reqNHfv7Y1a2Fm',
    '5AmJ1d9UXcDdyDSERwJAo6For94L35pZ4PMzbUiQyPrWJz74K3hP3BcgyNdVm5pEmgmTDApRXRTbvVxp67CpGoVB',
    '224jbsjbb2sv2dpedHxKzER4AaaULx1fhuBj92q5Z9p42YSxu84TjufxL5NNkNNisSSgWgaaENk69nLDDBy24ftZ',
    '3tWGLfN6FQA1M8W2wCEQ4h7BdYRhuaVFZnAugu8NDXx9Evrpu8g9muAM3QaapCFY4NuCZ534Z4Xg21eKfPXz6Pdj'
  ];
  
  try {
    console.log('Starting burn import...');
    
    const importer = new BurnImporter();
    const result = await importer.importBurns(signatures);
    
    console.log(`\n✅ Import complete! Processed ${result.length} burn events.`);
  } catch (err) {
    console.error('❌ Import failed:', err);
    process.exitCode = 1;
  }
})();
