require('dotenv').config();
const inquirer = require('inquirer');
const chalk = require('chalk');
const bcrypt = require('bcrypt');
const { MongoClient } = require('mongodb');
const Redis = require('redis');
const axios = require('axios');
const NodeCache = require('node-cache');
const initI18n = require('../config/i18n');
const EventCRUD = require('./EventCRUD');

// Initialize cache with 24 hour TTL
const geoDataCache = new NodeCache({ stdTTL: 86400 });

class EventLocatorApp {
  constructor(mongoUri) {
    this.mongoUri = mongoUri;
    this.client = new MongoClient(mongoUri);
    this.db = null;
    this.usersCollection = null;
    this.eventsCollection = null;
    this.i18n = null;
    this.currentUser = null;
    this.preferredLanguage = 'en';
    this.countries = [];
    this.citiesByCountry = {};

    this.redisClient = Redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 5000)
      }
    });

    this.eventCRUD = new EventCRUD(this);
  }

  async initialize() {
    this.i18n = await initI18n();
    
    try {
      await this.client.connect();
      this.db = this.client.db('event_locator');
      this.usersCollection = this.db.collection('users');
      this.eventsCollection = this.db.collection('events');

      await this.usersCollection.createIndexes([
        { key: { email: 1 }, unique: true },
        { key: { username: 1 }, unique: true }
      ]);
      await this.eventsCollection.createIndexes([
        { key: { location: '2dsphere' }},
        { key: { city: 1 }},
        { key: { country: 1 }}
      ]);

      await this.redisClient.connect();
      await this.loadCountriesAndCities();
      
      console.log(chalk.green(this.t('system.initialized')));
    } catch (error) {
      console.error(chalk.red(this.t('errors.initialization')), error);
      this.loadDummyData();
    }
  }

  async loadCountriesAndCities() {
    try {
      const cachedData = geoDataCache.get('eastAfricaGeoData');
      if (cachedData) {
        this.countries = cachedData.countries;
        this.citiesByCountry = cachedData.citiesByCountry;
        return;
      }

      await this.fetchFromCountriesNowAPI();

      if (this.countries.length === 0) {
        await this.fetchFromGeonamesAPI();
      }

      if (this.countries.length === 0) {
        this.loadDummyData();
      }

      geoDataCache.set('eastAfricaGeoData', {
        countries: this.countries,
        citiesByCountry: this.citiesByCountry
      });

    } catch (error) {
      console.error(chalk.yellow('Failed to load geo data:'), error.message);
      this.loadDummyData();
    }
  }

  async fetchFromCountriesNowAPI() {
    try {
      const response = await axios.get('https://countriesnow.space/api/v0.1/countries');
      const allCountries = response.data.data;
      
      const eastAfricanCountries = [
        'Rwanda', 'Kenya', 'Uganda', 'Tanzania', 
        'Burundi', 'Democratic Republic of the Congo'
      ];
      
      this.countries = eastAfricanCountries
        .filter(country => allCountries.some(c => c.country === country))
        .sort();

      await Promise.all(this.countries.map(async country => {
        const countryData = allCountries.find(c => c.country === country);
        if (countryData && countryData.cities) {
          this.citiesByCountry[country] = countryData.cities
            .filter(city => city && city.trim() !== '')
            .sort();
        } else {
          this.citiesByCountry[country] = this.getDummyCitiesForCountry(country);
        }
      }));

    } catch (error) {
      console.error(chalk.yellow('CountriesNow API failed:'), error.message);
      throw error;
    }
  }

  async fetchFromGeonamesAPI() {
    try {
      const username = process.env.GEONAMES_USERNAME || 'demo';
      if (username === 'demo') {
        console.log(chalk.yellow('Using Geonames demo account with limited requests'));
      }

      const eastAfricanCountries = [
        { name: 'Rwanda', code: 'RW' },
        { name: 'Kenya', code: 'KE' },
        { name: 'Uganda', code: 'UG' },
        { name: 'Tanzania', code: 'TZ' },
        { name: 'Burundi', code: 'BI' },
        { name: 'Democratic Republic of the Congo', code: 'CD' }
      ];

      this.countries = eastAfricanCountries.map(c => c.name).sort();

      await Promise.all(eastAfricanCountries.map(async ({ name, code }) => {
        try {
          const response = await axios.get(
            `http://api.geonames.org/searchJSON?country=${code}&featureClass=P&maxRows=15&username=${username}`
          );
          
          this.citiesByCountry[name] = response.data.geonames
            ?.map(city => city.name)
            .filter(city => city)
            .sort() || this.getDummyCitiesForCountry(name);
        } catch (error) {
          console.error(chalk.yellow(`Failed to fetch cities for ${name}:`), error.message);
          this.citiesByCountry[name] = this.getDummyCitiesForCountry(name);
        }
      }));

    } catch (error) {
      console.error(chalk.yellow('Geonames API failed:'), error.message);
      throw error;
    }
  }

  loadDummyData() {
    console.log(chalk.yellow('Using fallback dummy data'));
    this.countries = ["Rwanda", "Kenya", "Uganda", "Tanzania", "Burundi", "DR Congo"];
    this.citiesByCountry = {
      "Rwanda": ["Kigali", "Butare", "Gitarama", "Ruhengeri", "Musanze", "Gisenyi", "Kibuye"],
      "Kenya": ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret"],
      "Uganda": ["Kampala", "Entebbe", "Jinja", "Mbale", "Gulu"],
      "Tanzania": ["Dar es Salaam", "Dodoma", "Arusha", "Mwanza", "Zanzibar"],
      "Burundi": ["Bujumbura", "Gitega", "Ngozi", "Rumonge"],
      "DR Congo": ["Goma", "Bukavu", "Kinshasa", "Lubumbashi"],
      "Democratic Republic of the Congo": ["Goma", "Bukavu", "Kinshasa", "Lubumbashi"]
    };
  }

  getDummyCitiesForCountry(country) {
    const dummyData = {
      "Rwanda": ["Kigali", "Butare", "Gitarama", "Ruhengeri", "Musanze", "Gisenyi", "Kibuye"],
      "Kenya": ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret"],
      "Uganda": ["Kampala", "Entebbe", "Jinja", "Mbale", "Gulu"],
      "Tanzania": ["Dar es Salaam", "Dodoma", "Arusha", "Mwanza", "Zanzibar"],
      "Burundi": ["Bujumbura", "Gitega", "Ngozi", "Rumonge"],
      "DR Congo": ["Goma", "Bukavu", "Kinshasa", "Lubumbashi"],
      "Democratic Republic of the Congo": ["Goma", "Bukavu", "Kinshasa", "Lubumbashi"]
    };
    return dummyData[country] || [];
  }

  t(key, variables = {}) {
    return this.i18n.t(key, { ...variables, lng: this.preferredLanguage });
  }

  async showWelcomeMessage() {
    console.log(chalk.green(`\n${this.t('welcome')}`));
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log(chalk.yellow(this.t('continuing')));
  }

  async selectLanguage() {
    const { language } = await inquirer.prompt({
      type: 'list',
      name: 'language',
      message: this.t('language.select'),
      choices: [
        { name: 'English', value: 'en' },
        { name: 'Kinyarwanda', value: 'ki' },
        { name: 'French', value: 'fr' }
      ]
    });
    this.preferredLanguage = language;
    await this.i18n.changeLanguage(language);
    await this.showWelcomeMessage();
  }

  async mainMenu() {
    const menuChoices = {
        register: this.t('menu.options.register'),
        login: this.t('menu.options.login'),
        create_event: this.t('menu.options.create_event'),
        search_events: this.t('menu.options.search_events'),
        view_events: this.t('menu.options.view_events'),
        update_event: this.t('menu.options.update_event'),
        delete_event: this.t('menu.options.delete_event'),
        view_event_details: this.t('menu.options.view_event_details'),
        exit: this.t('menu.options.exit')
    };

    while (true) {
        const { action } = await inquirer.prompt({
            type: 'list',
            name: 'action',
            message: this.t('menu.main'),
            choices: Object.values(menuChoices)
        });

        const selectedAction = Object.keys(menuChoices).find(
            key => menuChoices[key] === action
        );

        switch (selectedAction) {
            case 'register':
                await this.registerUser();
                break;
            case 'login':
                await this.loginUser();
                break;
            case 'create_event':
                await this.createEvent();
                break;
            case 'search_events':
                await this.searchEvents();
                break;
            case 'view_events':
                await this.viewMyEvents();
                break;
            case 'update_event':
                await this.updateEvent();
                break;
            case 'delete_event':
                await this.deleteEvent();
                break;
            case 'view_event_details':
                await this.viewEventDetails();
                break;
            case 'exit':
                await this.close();
                process.exit(0);
        }
    }
}

  async registerUser() {
    const userData = await inquirer.prompt([
      {
        type: 'input',
        name: 'username',
        message: this.t('registration.username'),
        validate: input => input.length > 2 || this.t('validation.username')
      },
      {
        type: 'input',
        name: 'email',
        message: this.t('registration.email'),
        validate: input => /\S+@\S+\.\S+/.test(input) || this.t('validation.email')
      },
      {
        type: 'password',
        name: 'password',
        message: this.t('registration.password'),
        validate: input => input.length >= 8 || this.t('validation.password')
      },
      {
        type: 'checkbox',
        name: 'categories',
        message: this.t('registration.categories'),
        choices: ['Music', 'Sports', 'Technology', 'Education', 'Arts', 'Business']
      }
    ]);

    try {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const user = {
        username: userData.username,
        email: userData.email,
        password: hashedPassword,
        preferredLanguage: this.preferredLanguage,
        preferredCategories: userData.categories,
        createdAt: new Date()
      };

      await this.usersCollection.insertOne(user);
      console.log(chalk.green(this.t('registration.success', { username: userData.username })));
      this.currentUser = user;
    } catch (error) {
      if (error.code === 11000) {
        console.error(chalk.red(this.t('errors.duplicate_user')));
      } else {
        console.error(chalk.red(this.t('errors.registration_failed')), error.message);
      }
    }
  }

  async loginUser() {
    const credentials = await inquirer.prompt([
      {
        type: 'input',
        name: 'email',
        message: this.t('login.email')
      },
      {
        type: 'password',
        name: 'password',
        message: this.t('login.password')
      }
    ]);

    try {
      const user = await this.usersCollection.findOne({ email: credentials.email });
      if (!user) {
        console.log(chalk.red(this.t('errors.user_not_found')));
        return;
      }

      const passwordMatch = await bcrypt.compare(credentials.password, user.password);
      if (passwordMatch) {
        this.currentUser = user;
        this.preferredLanguage = user.preferredLanguage;
        console.log(chalk.green(this.t('login.success', { username: user.username })));
      } else {
        console.log(chalk.red(this.t('errors.invalid_password')));
      }
    } catch (error) {
      console.error(chalk.red(this.t('errors.login_failed')), error.message);
    }
  }

  async createEvent() {
    if (!this.currentUser) {
      console.log(chalk.red(this.t('errors.login_required')));
      return;
    }

    const eventData = await inquirer.prompt([
      {
        type: 'input',
        name: 'title',
        message: this.t('events.title'),
        validate: input => input.length > 0 || this.t('validation.required')
      },
      {
        type: 'input',
        name: 'description',
        message: this.t('events.description')
      },
      {
        type: 'list',
        name: 'category',
        message: this.t('events.category'),
        choices: ['Music', 'Sports', 'Technology', 'Education', 'Arts', 'Business']
      },
      {
        type: 'list',
        name: 'country',
        message: this.t('events.country'),
        choices: this.countries
      },
      {
        type: 'list',
        name: 'city',
        message: this.t('events.city'),
        choices: answers => this.citiesByCountry[answers.country] || [this.t('errors.city_not_listed')]
      },
      {
        type: 'input',
        name: 'venue',
        message: this.t('events.venue'),
        validate: input => input.length > 0 || this.t('validation.required')
      },
      {
        type: 'input',
        name: 'startTime',
        message: this.t('events.start_time'),
        validate: input => !isNaN(Date.parse(input)) || this.t('validation.date_format')
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
      console.log(chalk.green(this.t('events.created', {
        title: eventData.title,
        venue: eventData.venue,
        city: eventData.city
      })));

      await this.redisClient.publish('event_notifications', JSON.stringify({
        eventId: result.insertedId,
        title: eventData.title,
        category: eventData.category,
        city: eventData.city
      }));
    } catch (error) {
      console.error(chalk.red(this.t('errors.event_creation_failed')), error.message);
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
      console.error(chalk.yellow(this.t('errors.geocode_failed', { location })));
      return [30.0619, -1.9441]; // Default to Kigali coordinates
    }
  }

  async searchEvents() {
    const searchCriteria = await inquirer.prompt([
      {
        type: 'list',
        name: 'searchType',
        message: this.t('search.type'),
        choices: [
          this.t('search.types.city'),
          this.t('search.types.country'),
          this.t('search.types.venue')
        ]
      },
      {
        type: 'input',
        name: 'query',
        message: answers => this.t('search.query', { type: answers.searchType.toLowerCase() }),
        validate: input => input.length > 0 || this.t('validation.required')
      },
      {
        type: 'number',
        name: 'radius',
        message: this.t('search.radius'),
        default: 0
      },
      {
        type: 'checkbox',
        name: 'categories',
        message: this.t('search.filter'),
        choices: ['Music', 'Sports', 'Technology', 'Education', 'Arts', 'Business']
      }
    ]);

    try {
      let query = {};
      
      if (searchCriteria.searchType === this.t('search.types.city')) {
        query.city = new RegExp(searchCriteria.query, 'i');
      } else if (searchCriteria.searchType === this.t('search.types.country')) {
        query.country = new RegExp(searchCriteria.query, 'i');
      } else {
        query.venue = new RegExp(searchCriteria.query, 'i');
      }

      if (searchCriteria.radius > 0) {
        const coordinates = await this.geocodeLocation(searchCriteria.query);
        query.location = {
          $near: {
            $geometry: { type: 'Point', coordinates },
            $maxDistance: searchCriteria.radius * 1000
          }
        };
      }

      if (searchCriteria.categories.length > 0) {
        query.category = { $in: searchCriteria.categories.map(c => c.toLowerCase()) };
      }

      const events = await this.eventsCollection.find(query).sort({ startTime: 1 }).toArray();

      if (events.length === 0) {
        console.log(chalk.yellow(this.t('search.no_results')));
        return;
      }

      console.log(chalk.green(this.t('search.results', { count: events.length })));
      events.forEach(event => {
        console.log(chalk.cyan(
          this.t('events.details', {
            title: event.title,
            venue: event.venue,
            city: event.city,
            country: event.country,
            time: event.startTime.toLocaleString(),
            category: event.category.charAt(0).toUpperCase() + event.category.slice(1)
          })
        ));
      });
    } catch (error) {
      console.error(chalk.red(this.t('errors.search_failed')), error.message);
    }
  }

  async viewMyEvents() {
    if (!this.currentUser) {
      console.log(chalk.red(this.t('errors.login_required')));
      return;
    }

    try {
      const events = await this.eventsCollection.find({ 
        creatorId: this.currentUser._id 
      }).sort({ startTime: 1 }).toArray();

      if (events.length === 0) {
        console.log(chalk.yellow(this.t('events.none_created')));
        return;
      }

      console.log(chalk.green(this.t('events.your_events', { count: events.length })));
      events.forEach(event => {
        console.log(chalk.cyan(
          this.t('events.details', {
            title: event.title,
            venue: event.venue,
            city: event.city,
            country: event.country,
            time: event.startTime.toLocaleString(),
            category: event.category.charAt(0).toUpperCase() + event.category.slice(1)
          })
        ));
      });
    } catch (error) {
      console.error(chalk.red(this.t('errors.view_events_failed')), error.message);
    }
  }

  async updateEvent() {
    return this.eventCRUD.updateEvent();
  }

  async deleteEvent() {
    return this.eventCRUD.deleteEvent();
  }

  async viewEventDetails() {
    return this.eventCRUD.viewEventDetails();
  }

  async updateEventById(eventId) {
    return this.eventCRUD.updateEventById(eventId);
  }

  async deleteEventById(eventId) {
    return this.eventCRUD.deleteEventById(eventId);
  }

  async enhanceLocationData() {
    try {
      const eventsToEnhance = await this.eventsCollection.find({
        "enhancedLocation": { $exists: false }
      }).toArray();
      
      if (eventsToEnhance.length === 0) {
        return;
      }
      
      console.log(chalk.yellow(this.t('events.enhancing_locations', { count: eventsToEnhance.length })));
      
      let enhancedCount = 0;
      for (const event of eventsToEnhance) {
        try {
          const lat = event.location.coordinates[1];
          const lon = event.location.coordinates[0];
          const response = await axios.get(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
            { headers: { 'User-Agent': 'EventLocatorApp/1.0' } }
          );
          
          if (response.data && response.data.address) {
            const address = response.data.address;
            
            const enhancedLocation = {
              formattedAddress: response.data.display_name,
              street: address.road || address.street || null,
              houseNumber: address.house_number || null,
              suburb: address.suburb || null,
              city: address.city || address.town || address.village || event.city,
              county: address.county || null,
              state: address.state || null,
              country: address.country || event.country,
              postcode: address.postcode || null,
              raw: response.data
            };
            
            await this.eventsCollection.updateOne(
              { _id: event._id },
              { 
                $set: { 
                  enhancedLocation: enhancedLocation,
                  locationUpdatedAt: new Date()
                } 
              }
            );
            
            enhancedCount++;
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          console.error(chalk.red(this.t('errors.enhance_location_failed', { title: event.title })), error.message);
        }
      }
      
      console.log(chalk.green(this.t('events.enhanced_locations', { count: enhancedCount })));
    } catch (error) {
      console.error(chalk.red(this.t('errors.location_enhancement_failed')), error.message);
    }
  }

  async initializeBackgroundTasks() {
    this.enhanceLocationData();
    setInterval(() => this.enhanceLocationData(), 60 * 60 * 1000);
  }

  async close() {
    await this.client.close();
    await this.redisClient.quit();
  }
}

module.exports = EventLocatorApp;