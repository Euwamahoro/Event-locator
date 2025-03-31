require('dotenv').config();
const chalk = require('chalk');
const EventLocatorApp = require('./app/eventLocatorApp');

async function run() {
  if (!process.env.MONGO_URI) {
    console.error(chalk.red('✗ MONGO_URI is not defined in .env file'));
    process.exit(1);
  }

  const app = new EventLocatorApp(process.env.MONGO_URI);
  
  try {
    await app.initialize();
    await app.selectLanguage();
    await app.mainMenu();
  } catch (error) {
    console.error(chalk.red('Fatal error:'), error);
  } finally {
    await app.close();
  }
}

run();