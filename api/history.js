const { supabase } = require('./_supabase');
const { formatBurnEvent } = require('./_util');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { limit, start, end } = req.query;
    
    let query = supabase
      .from('burn_events')
      .select('*')
      .order('timestamp', { ascending: false });

    // Apply limit
    if (limit) {
      const limitNum = parseInt(limit);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
        return res.status(400).json({ error: 'Invalid limit parameter. Must be between 1 and 1000.' });
      }
      query = query.limit(limitNum);
    } else {
      query = query.limit(100); // Default limit
    }

    // Apply date range filters
    if (start) {
      const startDate = new Date(start);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ error: 'Invalid start date format. Use YYYY-MM-DD.' });
      }
      query = query.gte('timestamp', startDate.toISOString());
    }

    if (end) {
      const endDate = new Date(end);
      if (isNaN(endDate.getTime())) {
        return res.status(400).json({ error: 'Invalid end date format. Use YYYY-MM-DD.' });
      }
      // Add one day to include the entire end date
      endDate.setDate(endDate.getDate() + 1);
      query = query.lt('timestamp', endDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    const formattedData = data.map(formatBurnEvent);

    res.status(200).json({
      count: formattedData.length,
      data: formattedData
    });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
