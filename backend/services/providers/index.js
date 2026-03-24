const PROVIDERS = {
    gemini: () => require('./gemini'),
    claude: () => require('./claude'),
    openai: () => require('./openai'),
    ollama: () => require('./ollama'),
};

let activeProvider = null;

function getProvider() {
    if (!activeProvider) {
        const name = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
        const factory = PROVIDERS[name];
        if (!factory) {
            throw new Error(`Unknown AI_PROVIDER "${name}". Supported: ${Object.keys(PROVIDERS).join(', ')}`);
        }
        activeProvider = factory();
        console.log(`🤖 AI provider: ${name}`);
    }
    return activeProvider;
}

/**
 * Send a prompt to the configured AI provider and get raw text back.
 * @param {string} prompt - The full prompt
 * @param {'lite'|'mid'|'pro'} tier - Model tier to use
 * @returns {Promise<string>} Raw response text (expected to be JSON)
 */
async function generate(prompt, tier = 'mid') {
    return getProvider().generate(prompt, tier);
}

module.exports = { generate, getProvider };
