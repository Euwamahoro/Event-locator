require('dotenv').config();
const inquirer = require('inquirer');
const chalk = require('chalk');
const bcrypt = require('bcrypt');
const { MongoClient } = require('mongodb');
const Redis = require('redis');
const axios = require('axios');

class EventLocatorApp {
  constructor(mongoUri) {
    this.mongoUri = mongoUri;
    this.client = new MongoClient(mongoUri);
    this.db = null;
    this.usersCollection = null;
    this.eventsCollection = null;

    // Redis connection
    this.redisClient = Redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            console.log(chalk.yellow('Redis connection failed after 3 retries'));
            return new Error('Could not connect after 3 attempts');
          }
          return Math.min(retries * 100, 5000);
        }
      }
    });

    this.currentUser = null;
    
    // Location data
    // if it is possible look for and open api where we can fetch this info. instead of using dommy data


    this.countries = ["Rwanda", "Kenya", "Uganda", "Tanzania", "Burundi", "DR Congo"];
    this.citiesByCountry = {
      "Rwanda": ["Kigali", "Butare", "Gitarama", "Ruhengeri", "Musanze", "Gisenyi", "Kibuye"],
      "Kenya": ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret"],
      "Uganda": ["Kampala", "Entebbe", "Jinja", "Mbale", "Gulu"],
      "Tanzania": ["Dar es Salaam", "Dodoma", "Arusha", "Mwanza", "Zanzibar"],
      "Burundi": ["Bujumbura", "Gitega", "Ngozi", "Rumonge"],
      "DR Congo": ["Goma", "Bukavu", "Kinshasa", "Lubumbashi"]
    };
  }

  async initialize() {
    try {
      // Connect to MongoDB
      await this.client.connect();
      this.db = this.client.db('event_locator');
      this.usersCollection = this.db.collection('users');
      this.eventsCollection = this.db.collection('events');

      // Create indexes
      await this.usersCollection.createIndex({ email: 1 }, { unique: true });
      await this.usersCollection.createIndex({ username: 1 }, { unique: true });
      await this.eventsCollection.createIndex({ location: '2dsphere' });
      await this.eventsCollection.createIndex({ city: 1 });
      await this.eventsCollection.createIndex({ country: 1 });

      console.log(chalk.green('✓ MongoDB connection established'));

      // Handle Redis connection
      try {
        await this.redisClient.connect();
        console.log(chalk.green('✓ Redis connection established'));
      } catch (redisError) {
        console.log(chalk.yellow('⚠ Redis connection failed - continuing without it'));
        this.redisClient = {
          publish: () => Promise.resolve(),
          quit: () => Promise.resolve()
        };
      }
    } catch (error) {
      console.error(chalk.red('✗ Initialization error:'), error);
      process.exit(1);
    }
  }

  async mainMenu() {
    const { action } = await inquirer.prompt({
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        'Register',
        'Login',
        'Create Event',
        'Search Events',
        'View My Events',
        'Exit'
      ]
    });

    switch (action) {
      case 'Register':
        await this.registerUser();
        break;
      case 'Login':
        await this.loginUser();
        break;
      case 'Create Event':
        await this.createEvent();
        break;
      case 'Search Events':
        await this.searchEvents();
        break;
      case 'View My Events':
        await this.viewMyEvents();
        break;
      case 'Exit':
        await this.close();
        process.exit(0);
    }

    await this.mainMenu();
  }

  async registerUser() {
    const userData = await inquirer.prompt([
      {
        type: 'input',
        name: 'username',
        message: 'Choose a username:',
        validate: input => input.length > 2 ? true : 'Username must be at least 3 characters'
      },
      {
        type: 'input',
        name: 'email',
        message: 'Enter your email:',
        validate: input => /\S+@\S+\.\S+/.test(input) ? true : 'Invalid email format'
      },
      {
        type: 'password',
        name: 'password',
        message: 'Choose a password:',
        validate: input => input.length >= 8 ? true : 'Password must be at least 8 characters'
      },
      {
        type: 'list',
        name: 'language',
        message: 'Preferred Language:',
        choices: ['English', 'Kinyarwanda', 'Swahili', 'French']
      },
      {
        type: 'checkbox',
        name: 'categories',
        message: 'Select event categories of interest:',
        choices: ['Music', 'Sports', 'Technology', 'Education', 'Arts', 'Business']
      }
    ]);

    try {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const user = {
        username: userData.username,
        email: userData.email,
        password: hashedPassword,
        preferredLanguage: userData.language.toLowerCase().slice(0,2),
        preferredCategories: userData.categories,
        createdAt: new Date()
      };

      const result = await this.usersCollection.insertOne(user);
      console.log(chalk.green(`✓ User ${userData.username} registered successfully!`));
    } catch (error) {
      if (error.code === 11000) {
        console.error(chalk.red('✗ Username or email already exists'));
      } else {
        console.error(chalk.red('✗ Registration failed:'), error.message);
      }
    }
  }

  async loginUser() {
    const credentials = await inquirer.prompt([
      {
        type: 'input',
        name: 'email',
        message: 'Enter your email:'
      },
      {
        type: 'password',
        name: 'password',
        message: 'Enter your password:'
      }
    ]);

    try {
      const user = await this.usersCollection.findOne({ email: credentials.email });
      if (!user) {
        console.log(chalk.red('✗ User not found'));
        return;
      }

      const passwordMatch = await bcrypt.compare(credentials.password, user.password);
      if (passwordMatch) {
        this.currentUser = user;
        console.log(chalk.green(`✓ Welcome, ${user.username}!`));
      } else {
        console.log(chalk.red('✗ Invalid password'));
      }
    } catch (error) {
      console.error(chalk.red('✗ Login failed:'), error.message);
    }
  }

  async createEvent() {
    if (!this.currentUser) {
      console.log(chalk.red('✗ Please login first'));
      return;
    }

    const eventData = await inquirer.prompt([
      {
        type: 'input',
        name: 'title',
        message: 'Event Title:',
        validate: input => input.length > 0 ? true : 'Title is required'
      },
      {
        type: 'input',
        name: 'description',
        message: 'Event Description:'
      },
      {
        type: 'list',
        name: 'category',
        message: 'Event Category:',
        choices: ['Music', 'Sports', 'Technology', 'Education', 'Arts', 'Business']
      },
      {
        type: 'list',
        name: 'country',
        message: 'Country:',
        choices: this.countries
      },
      {
        type: 'list',
        name: 'city',
        message: 'City:',
        choices: (answers) => this.citiesByCountry[answers.country] || ['City not listed']
      },
      {
        type: 'input',
        name: 'venue',
        message: 'Venue or Address:',
        validate: input => input.length > 0 ? true : 'Venue is required'
      },
      {
        type: 'input',
        name: 'startTime',
        message: 'Start Time (YYYY-MM-DD HH:MM):',
        validate: input => !isNaN(Date.parse(input)) ? true : 'Invalid date format'
      }
    ]);

    try {
      const coordinates = await this.geocodeLocation(`${eventData.venue}, ${eventData.city}, ${eventData.country}`);
      
      const event = {
        title: eventData.title,
        description: eventData.description,
        category: eventData.category.toLowerCase(),
        country: eventData.country,
        city: eventData.city,
        venue: eventData.venue,
        location: {
          type: 'Point',
          coordinates: coordinates
        },
        startTime: new Date(eventData.startTime),
        creatorId: this.currentUser._id,
        createdAt: new Date()
      };

      const result = await this.eventsCollection.insertOne(event);
      console.log(chalk.green(`✓ Event "${eventData.title}" created at ${eventData.venue}, ${eventData.city}!`));
      
      await this.redisClient.publish(
        'event_notifications', 
        JSON.stringify({
          eventId: result.insertedId,
          title: eventData.title,
          category: eventData.category,
          city: eventData.city
        })
      );
    } catch (error) {
      console.error(chalk.red('✗ Event creation failed:'), error.message);
    }
  }

  async geocodeLocation(location) {
    try {
      const response = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`);
      
      if (response.data && response.data.length > 0) {
        return [parseFloat(response.data[0].lon), parseFloat(response.data[0].lat)];
      }
      throw new Error('Location not found');
    } catch (error) {
      console.error(chalk.yellow(`⚠ Could not geocode ${location}, using default coordinates`));
      return [30.0619, -1.9441]; // Default to Kigali coordinates
    }
  }

  async searchEvents() {
    const searchCriteria = await inquirer.prompt([
      {
        type: 'list',
        name: 'searchType',
        message: 'Search by:',
        choices: ['City', 'Country', 'Venue']
      },
      {
        type: 'input',
        name: 'location',
        message: answers => `Enter ${answers.searchType.toLowerCase()} to search in:`,
        validate: input => input.length > 0 ? true : 'Location cannot be empty'
      },
      {
        type: 'number',
        name: 'radius',
        message: 'Search Radius (km) - leave blank for city-wide search:',
        default: 0
      },
      {
        type: 'checkbox',
        name: 'categories',
        message: 'Filter by Categories:',
        choices: ['Music', 'Sports', 'Technology', 'Education', 'Arts', 'Business']
      }
    ]);

    try {
      let query = {};
      
      // Text-based search
      if (searchCriteria.searchType === 'City') {
        query.city = new RegExp(searchCriteria.location, 'i');
      } else if (searchCriteria.searchType === 'Country') {
        query.country = new RegExp(searchCriteria.location, 'i');
      } else {
        query.venue = new RegExp(searchCriteria.location, 'i');
      }

      // Add geospatial search if radius is specified
      if (searchCriteria.radius > 0) {
        const coordinates = await this.geocodeLocation(searchCriteria.location);
        query.location = {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: coordinates
            },
            $maxDistance: searchCriteria.radius * 1000
          }
        };
      }

      // Add category filter if selected
      if (searchCriteria.categories.length > 0) {
        query.category = { $in: searchCriteria.categories.map(c => c.toLowerCase()) };
      }

      const events = await this.eventsCollection.find(query).sort({ startTime: 1 }).toArray();

      if (events.length === 0) {
        console.log(chalk.yellow('No events found matching your criteria.'));
        return;
      }

      console.log(chalk.green(`\n✓ Found ${events.length} events:`));
      events.forEach(event => {
        console.log(chalk.cyan(`
${chalk.bold(event.title)}
📍 ${event.venue}, ${event.city}, ${event.country}
🗓  ${event.startTime.toLocaleString()}
🏷  ${event.category.charAt(0).toUpperCase() + event.category.slice(1)}
        `));
      });
    } catch (error) {
      console.error(chalk.red('✗ Event search failed:'), error.message);
    }
  }

  async viewMyEvents() {
    if (!this.currentUser) {
      console.log(chalk.red('✗ Please login first'));
      return;
    }

    try {
      const events = await this.eventsCollection.find({ 
        creatorId: this.currentUser._id 
      }).sort({ startTime: 1 }).toArray();

      if (events.length === 0) {
        console.log(chalk.yellow('You have not created any events yet.'));
        return;
      }

      console.log(chalk.green(`\n✓ Your ${events.length} events:`));
      events.forEach(event => {
        console.log(chalk.cyan(`
${chalk.bold(event.title)}
📍 ${event.venue}, ${event.city}, ${event.country}
🗓  ${event.startTime.toLocaleString()}
🏷  ${event.category.charAt(0).toUpperCase() + event.category.slice(1)}
        `));
      });
    } catch (error) {
      console.error(chalk.red('✗ Failed to retrieve events:'), error.message);
    }
  }

  async close() {
    await this.client.close();
    await this.redisClient.quit();
  }
}

// Main execution
async function run() {
  if (!process.env.MONGO_URI) {
    console.error(chalk.red('✗ MONGO_URI is not defined in .env file'));
    process.exit(1);
  }

  const app = new EventLocatorApp(process.env.MONGO_URI);
  
  try {
    await app.initialize();
    await app.mainMenu();
  } catch (error) {
    console.error(chalk.red('Fatal error:'), error);
  } finally {
    await app.close();
  }
}

run();