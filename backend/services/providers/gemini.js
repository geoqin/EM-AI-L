const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODELS = {
    lite: 'gemini-2.5-flash-lite',
    mid: 'gemini-2.5-flash',
    pro: 'gemini-2.5-pro',
};

let genAI;

function getClient() {
    if (!genAI) {
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    return genAI;
}

async function generate(prompt, tier = 'mid') {
    const client = getClient();
    const modelName = MODELS[tier] || MODELS.mid;
    const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
            temperature: 0.3,
            responseMimeType: 'application/json',
        },
    });

    const result = await model.generateContent(prompt);
    return result.response.text();
}

module.exports = { generate, MODELS };
