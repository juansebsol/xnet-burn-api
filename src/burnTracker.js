const { Connection, PublicKey } = require('@solana/web3.js');

class BurnTracker {
  constructor() {
    this.connection = new Connection(process.env.RPC_URL || 'https://api.mainnet-beta.solana.com');
    this.targetWallet = new PublicKey(process.env.TARGET_WALLET || 'B9SXSuPwpzmYUgk1GRfuW9R9QDMJ6P9SfTybSoawHiLj');
    this.tokenMint = process.env.TOKEN_MINT;
    this.maxRetries = parseInt(process.env.MAX_RPC_RETRIES) || 3;
    this.batchSize = parseInt(process.env.BATCH_SIZE) || 10;
  }

  async getRecentTransactions(limit = 100) {
    let retries = 0;
    
    while (retries < this.maxRetries) {
      try {
        console.log(`Fetching recent transactions for wallet: ${this.targetWallet.toString()}`);
        
        const signatures = await this.connection.getSignaturesForAddress(
          this.targetWallet,
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

  isBurnTransaction(transaction) {
    if (!transaction || !transaction.meta) {
      return false;
    }

    const { meta } = transaction;
    
    // Check if this is a burn transaction
    // Burn transactions typically have:
    // 1. Token balance changes that result in supply reduction
    // 2. Transfer to a burn address or null address
    // 3. No recipient in token transfers
    
    // Check for token balance changes
    if (meta.preTokenBalances && meta.postTokenBalances) {
      const preBalances = meta.preTokenBalances;
      const postBalances = meta.postTokenBalances;
      
      // Look for token balance decreases that could indicate burns
      for (const preBalance of preBalances) {
        const postBalance = postBalances.find(
          post => post.accountIndex === preBalance.accountIndex && 
                  post.mint === preBalance.mint
        );
        
        if (postBalance) {
          const preAmount = parseInt(preBalance.uiTokenAmount.amount);
          const postAmount = parseInt(postBalance.uiTokenAmount.amount);
          
          // If balance decreased and no corresponding increase elsewhere
          if (preAmount > postAmount) {
            const decreaseAmount = preAmount - postAmount;
            
            // Check if this looks like a burn (no corresponding increase in other accounts)
            const totalIncrease = postBalances
              .filter(post => post.mint === preBalance.mint)
              .reduce((sum, post) => {
                const pre = preBalances.find(p => p.accountIndex === post.accountIndex && p.mint === post.mint);
                const preAmt = pre ? parseInt(pre.uiTokenAmount.amount) : 0;
                const postAmt = parseInt(post.uiTokenAmount.amount);
                return sum + Math.max(0, postAmt - preAmt);
              }, 0);
            
            // If the decrease is not matched by increases elsewhere, it's likely a burn
            if (totalIncrease < decreaseAmount) {
              return {
                isBurn: true,
                amount: decreaseAmount,
                mint: preBalance.mint,
                decimals: preBalance.uiTokenAmount.decimals,
                fromAccount: preBalance.owner
              };
            }
          }
        }
      }
    }
    
    return { isBurn: false };
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
        if (!transaction) return null;
        
        const burnResult = this.isBurnTransaction(transaction);
        if (burnResult.isBurn) {
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
