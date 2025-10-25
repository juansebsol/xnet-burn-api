// Utility functions for API responses

function formatAmount(amount, decimals = 9) {
  if (!amount) return '0';
  const num = parseFloat(amount) / Math.pow(10, decimals);
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  });
}


function formatTimestamp(timestamp) {
  return new Date(timestamp).toISOString();
}

function formatBurnEvent(event) {
  return {
    signature: event.signature,
    timestamp: formatTimestamp(event.timestamp),
    action: event.action || 'Burn',
    from_address: event.from_address,
    to_address: event.to_address,
    amount: event.amount,
    amountFormatted: formatAmount(event.amount, 9),
    token: event.token || 'XNET',
    scrape_time: formatTimestamp(event.scrape_time)
  };
}

module.exports = {
  formatAmount,
  formatTimestamp,
  formatBurnEvent
};
