const Anthropic = require('@anthropic-ai/sdk');

const MODELS = {
    lite: 'claude-haiku-4-5-20251001',
    mid: 'claude-sonnet-4-6',
    pro: 'claude-opus-4-6',
};

let client;

function getClient() {
    if (!client) {
        client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return client;
}

async function generate(prompt, tier = 'mid') {
    const c = getClient();
    const modelName = MODELS[tier] || MODELS.mid;

    const message = await c.messages.create({
        model: modelName,
        max_tokens: 4096,
        temperature: 0.3,
        messages: [
            {
                role: 'user',
                content: prompt + '\n\nRespond with valid JSON only. No markdown code fences.',
            },
        ],
    });

    return message.content[0].text;
}

module.exports = { generate, MODELS };
