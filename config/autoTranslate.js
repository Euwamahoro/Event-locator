const { TranslationServiceClient } = require('@google-cloud/translate').v3;
const chalk = require('chalk');

const translationCache = new Map();

module.exports = async function autoTranslate(text, targetLanguage) {
  // Check cache first
  const cacheKey = `${targetLanguage}:${text}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  // Development mock (no API keys needed)
  if (process.env.NODE_ENV === 'development' && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const mockTranslations = {
      fr: `${text} (traduit en français)`,
      ki: `${text} (yahinduwe mu Kinyarwanda)`,
    };
    const result = mockTranslations[targetLanguage] || text;
    translationCache.set(cacheKey, result);
    return result;
  }

  // Real Google Cloud Translation
  try {
    const translationClient = new TranslationServiceClient();
    const [response] = await translationClient.translateText({
      parent: `projects/${process.env.GOOGLE_PROJECT_ID}/locations/global`,
      contents: [text],
      mimeType: 'text/plain',
      targetLanguageCode: targetLanguage,
    });
    
    const result = response.translations[0].translatedText;
    translationCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error(chalk.red('Translation API Error:'), error);
    throw error;
  }
};