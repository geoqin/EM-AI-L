const OpenAI = require('openai');

const MODELS = {
    lite: 'gpt-4o-mini',
    mid: 'gpt-4o',
    pro: 'gpt-4o',
};

let client;

function getClient() {
    if (!client) {
        client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return client;
}

async function generate(prompt, tier = 'mid') {
    const c = getClient();
    const modelName = MODELS[tier] || MODELS.mid;

    const response = await c.chat.completions.create({
        model: modelName,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
            {
                role: 'system',
                content: 'You are a helpful assistant. Always respond with valid JSON.',
            },
            {
                role: 'user',
                content: prompt,
            },
        ],
    });

    return response.choices[0].message.content;
}

module.exports = { generate, MODELS };
