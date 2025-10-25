const { Connection, PublicKey } = require('@solana/web3.js');

class BurnTracker {
  constructor() {
    this.connection = new Connection(process.env.RPC_URL || 'https://api.mainnet-beta.solana.com');
    this.targetWallet = new PublicKey(process.env.TARGET_WALLET || 'B9SXSuPwpzmYUgk1GRfuW9R9QDMJ6P9SfTybSoawHiLj');
    this.tokenMint = process.env.TOKEN_MINT;
    this.tokenAccount = process.env.TOKEN_ACCOUNT; // The actual token account to monitor
    this.maxRetries = parseInt(process.env.MAX_RPC_RETRIES) || 3;
    this.batchSize = parseInt(process.env.BATCH_SIZE) || 10;
  }

  async getRecentTransactions(limit = 100) {
    let retries = 0;
    
    while (retries < this.maxRetries) {
      try {
        // Use the token account if provided, otherwise fall back to wallet
        const addressToMonitor = this.tokenAccount ? new PublicKey(this.tokenAccount) : this.targetWallet;
        console.log(`Fetching recent transactions for: ${addressToMonitor.toString()}`);
        
        const signatures = await this.connection.getSignaturesForAddress(
          addressToMonitor,
          { limit }
        );
        
        console.log(`Found ${signatures.length} recent transactions`);
        return signatures;
      } catch (error) {
        retries++;
        console.error(`RPC error (attempt ${retries}/${this.maxRetries}):`, error.message);
        
        if (retries >= this.maxRetries) {
          throw new Error(`Failed to fetch transactions after ${this.maxRetries} attempts: ${error.message}`);
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
      }
    }
  }

  async getTransactionDetails(signature) {
    let retries = 0;
    
    while (retries < this.maxRetries) {
      try {
        const transaction = await this.connection.getTransaction(signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        });
        
        return transaction;
      } catch (error) {
        retries++;
        console.error(`Error fetching transaction ${signature} (attempt ${retries}/${this.maxRetries}):`, error.message);
        
        if (retries >= this.maxRetries) {
          console.error(`Failed to fetch transaction ${signature} after ${this.maxRetries} attempts`);
          return null;
        }
        
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
    
    // Special debugging for the known burn transaction
    if (signature === '4bXcR1sqdHvxfEh36mi68Xwyko4dAnhhAuMmjZhCAYngBqdG3vTZ5kwpuJ246KNsSe4U87kdmLQ6Ucftrt42tkbV') {
      console.log(`    🔍 DEBUGGING KNOWN BURN TRANSACTION`);
      console.log(`    Meta keys:`, Object.keys(meta));
      console.log(`    Log messages:`, meta.logMessages);
      console.log(`    Pre token balances:`, meta.preTokenBalances);
      console.log(`    Post token balances:`, meta.postTokenBalances);
    }
    
    // ONLY check transaction logs for burn instructions - no fallback to balance changes
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



  async processTransactions(signatures) {
    const burnEvents = [];
    const batchSize = this.batchSize;
    
    console.log(`Processing ${signatures.length} transactions in batches of ${batchSize}`);
    
    for (let i = 0; i < signatures.length; i += batchSize) {
      const batch = signatures.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(signatures.length / batchSize)}`);
      
      const batchPromises = batch.map(async (sig) => {
        const transaction = await this.getTransactionDetails(sig.signature);
        if (!transaction) {
          console.log(`\n❌ TXN: ${sig.signature}`);
          console.log(`    Status: Failed to fetch transaction details`);
          return null;
        }
        
        const burnResult = this.isBurnTransaction(transaction, sig.signature);
        
        if (burnResult.isBurn) {
          console.log(`\n🔥 TXN: ${sig.signature}`);
          console.log(`    Status: BURN DETECTED!`);
          console.log(`    Amount: ${burnResult.amount}`);
          console.log(`    Mint: ${burnResult.mint}`);
          console.log(`    From: ${burnResult.fromAccount}`);
          return {
            signature: sig.signature,
            timestamp: new Date(sig.blockTime * 1000).toISOString(),
            action: 'Burn',
            from_address: burnResult.fromAccount,
            to_address: null, // Burns don't have a recipient
            amount: burnResult.amount.toString(),
            token: this.tokenMint || 'XNET',
            scrape_time: new Date().toISOString()
          };
        } else {
          console.log(`\n✅ TXN: ${sig.signature}`);
          console.log(`    Status: Not a burn transaction`);
        }
        return null;
      });
      
      const batchResults = await Promise.all(batchPromises);
      const batchBurns = batchResults.filter(result => result !== null);
      burnEvents.push(...batchBurns);
      
      console.log(`Batch ${Math.floor(i / batchSize) + 1}: Found ${batchBurns.length} burn events`);
      
      // Small delay between batches to respect RPC limits
      if (i + batchSize < signatures.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return burnEvents;
  }

  async trackBurns(limit = 100) {
    try {
      console.log('Starting burn tracking...');
      
      const signatures = await this.getRecentTransactions(limit);
      const burnEvents = await this.processTransactions(signatures);
      
      console.log(`Burn tracking complete. Found ${burnEvents.length} burn events.`);
      return {
        totalChecked: signatures.length,
        burnEvents,
        success: true
      };
    } catch (error) {
      console.error('Burn tracking failed:', error);
      return {
        totalChecked: 0,
        burnEvents: [],
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = { BurnTracker };
