const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const autoTranslate = require('./autoTranslate');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');

// Cache for missing keys to avoid duplicate translation attempts
const missingKeyCache = new Map();

module.exports = async function initI18n() {
  const instance = i18next.createInstance();

  // Verify locales directory exists
  const localesPath = path.join(__dirname, '../locales');
  if (!fs.existsSync(localesPath)) {
    throw new Error(`Locales directory not found at ${localesPath}`);
  }

  try {
    await instance
      .use(Backend)
      .init({
        fallbackLng: 'en',
        ns: ['common'],
        defaultNS: 'common',
        backend: {
          loadPath: path.join(__dirname, '../locales/{{lng}}/{{ns}}.json'),
          addPath: path.join(__dirname, '../locales/{{lng}}/{{ns}}.missing.json')
        },
        interpolation: {
          escapeValue: false
        },
        saveMissing: true,
        saveMissingTo: 'current',
        missingKeyHandler: async (lngs, ns, key) => {
          // Check cache first
          const cacheKey = `${lngs[0]}:${key}`;
          if (missingKeyCache.has(cacheKey)) {
            return missingKeyCache.get(cacheKey);
          }

          if (process.env.USE_AUTO_TRANSLATE === 'true') {
            try {
              const translated = await autoTranslate(key, lngs[0]);
              
              // Add to instance and cache
              instance.addResource(lngs[0], ns, key, translated);
              missingKeyCache.set(cacheKey, translated);
              
              console.log(chalk.green(`✓ Auto-translated "${key}" to ${lngs[0]}: ${translated}`));
              return translated;
            } catch (err) {
              console.error(chalk.red(`✗ Auto-translation failed for "${key}"`), err);
              missingKeyCache.set(cacheKey, key); // Cache even failures
              return key;
            }
          }
          missingKeyCache.set(cacheKey, key);
          return key;
        }
      });

    // Log loaded languages
    console.log(chalk.blue('✓ Loaded languages:'), instance.languages.join(', '));
    
    return instance;
  } catch (err) {
    console.error(chalk.red('✗ i18n initialization failed:'), err);
    throw err;
  }
};