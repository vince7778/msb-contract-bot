/**
 * Conversation Memory
 * Stores context for each thread so the bot remembers what client you're talking about
 */

// In-memory storage (keyed by thread_ts or channel+ts combo)
const conversations = new Map();

// How long to keep conversations in memory (2 hours)
const MEMORY_TTL = 2 * 60 * 60 * 1000;

/**
 * Get the memory key for a message
 */
function getKey(channelId, threadTs) {
  return `${channelId}:${threadTs || 'main'}`;
}

/**
 * Store client data for a thread
 */
function remember(channelId, threadTs, clientData) {
  const key = getKey(channelId, threadTs);
  conversations.set(key, {
    clientData,
    timestamp: Date.now(),
    history: []
  });
  console.log(`[Memory] Stored context for ${key}: ${clientData.clientName}`);
}

/**
 * Update client data (for edits/changes)
 */
function update(channelId, threadTs, clientData, changeDescription) {
  const key = getKey(channelId, threadTs);
  const existing = conversations.get(key);

  if (existing) {
    // Keep history of changes
    existing.history.push({
      previousData: { ...existing.clientData },
      change: changeDescription,
      timestamp: Date.now()
    });
    existing.clientData = clientData;
    existing.timestamp = Date.now();
    conversations.set(key, existing);
    console.log(`[Memory] Updated context for ${key}: ${changeDescription}`);
  } else {
    // No existing context, just store it
    remember(channelId, threadTs, clientData);
  }
}

/**
 * Recall client data for a thread
 */
function recall(channelId, threadTs) {
  const key = getKey(channelId, threadTs);
  const data = conversations.get(key);

  if (!data) {
    console.log(`[Memory] No context found for ${key}`);
    return null;
  }

  // Check if expired
  if (Date.now() - data.timestamp > MEMORY_TTL) {
    console.log(`[Memory] Context expired for ${key}`);
    conversations.delete(key);
    return null;
  }

  console.log(`[Memory] Recalled context for ${key}: ${data.clientData.clientName}`);
  return data.clientData;
}

/**
 * Get conversation history for a thread
 */
function getHistory(channelId, threadTs) {
  const key = getKey(channelId, threadTs);
  const data = conversations.get(key);
  return data ? data.history : [];
}

/**
 * Check if we have context for a thread
 */
function hasContext(channelId, threadTs) {
  const key = getKey(channelId, threadTs);
  const data = conversations.get(key);

  if (!data) return false;
  if (Date.now() - data.timestamp > MEMORY_TTL) {
    conversations.delete(key);
    return false;
  }
  return true;
}

/**
 * Clear old conversations (run periodically)
 */
function cleanup() {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, data] of conversations) {
    if (now - data.timestamp > MEMORY_TTL) {
      conversations.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[Memory] Cleaned up ${cleaned} expired conversations`);
  }
}

// Run cleanup every 30 minutes
setInterval(cleanup, 30 * 60 * 1000);

module.exports = {
  remember,
  recall,
  update,
  getHistory,
  hasContext,
  cleanup
};
