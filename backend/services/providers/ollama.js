const MODELS = {
    lite: process.env.OLLAMA_MODEL || 'llama3.1',
    mid: process.env.OLLAMA_MODEL || 'llama3.1',
    pro: process.env.OLLAMA_MODEL || 'llama3.1',
};

const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

async function generate(prompt, tier = 'mid') {
    const modelName = MODELS[tier] || MODELS.mid;

    const response = await fetch(`${BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: modelName,
            prompt: prompt + '\n\nRespond with valid JSON only. No markdown code fences, no explanation.',
            stream: false,
            format: 'json',
            options: { temperature: 0.3 },
        }),
    });

    if (!response.ok) {
        throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    return data.response;
}

module.exports = { generate, MODELS };
