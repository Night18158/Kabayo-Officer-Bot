const { Ollama } = require('ollama');
const config = require('../config');

const SYSTEM_PROMPT = `You are Airi, a helpful and friendly assistant for the Kabayo Uma Musume: Pretty Derby guild. \
You help guild members with game tips, strategy advice, and motivation. \
You know about weekly fan tracking, performance tiers (🔴 RED < 4.2M, 🟡 YELLOW < 4.8M, 🟢 GREEN < 5.5M, ⚡ ELITE ≥ 5.5M weekly fans), \
and how the circle's leaderboard system works. \
Keep answers concise, upbeat, and focused on Uma Musume or guild management. \
If you don't know something, say so honestly.`;

let _client = null;

function getClient() {
  if (!_client) {
    _client = new Ollama({ host: config.ollama.host });
  }
  return _client;
}

/**
 * Ask the local Ollama LLM a question.
 * @param {string} question - The user's question.
 * @param {string|null} memberContext - Optional extra context (e.g. member's current status).
 * @returns {Promise<string>} The model's reply text.
 */
async function askOllama(question, memberContext = null) {
  const client = getClient();
  const userContent = memberContext
    ? `${memberContext}\n\n${question}`
    : question;

  const response = await client.chat({
    model: config.ollama.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  });

  return response.message?.content?.trim() ?? '';
}

module.exports = { askOllama };
