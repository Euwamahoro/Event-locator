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
const { Table } = require('console-table-printer');

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

  getEventStatus(event) {
    const now = new Date();
    const eventDate = new Date(event.startTime);
    const oneDayBefore = new Date(eventDate);
    oneDayBefore.setDate(oneDayBefore.getDate() - 1);

    if (now > eventDate) {
      return { status: 'Overdue', color: 'red' };
    } else if (now >= oneDayBefore && now <= eventDate) {
      return { status: 'Due', color: 'yellow' };
    } else {
      return { status: 'Pending', color: 'green' };
    }
  }

  async displayEventsTable(events, title = 'Events') {
    try {
      if (!events || events.length === 0) {
        console.log(chalk.yellow(this.t('events.no_events_found', { defaultValue: 'No events found' })));
        return;
      }
  
      const table = new Table({
        title: chalk.blue.bold(title),
        columns: [
          { name: 'index', alignment: 'left', title: '#' },
          { name: 'title', alignment: 'left', title: this.t('events.table.title', { defaultValue: 'Title' }) },
          { name: 'venue', alignment: 'left', title: this.t('events.table.venue', { defaultValue: 'Venue' }) },
          { name: 'city', alignment: 'left', title: this.t('events.table.city', { defaultValue: 'City' }) },
          { name: 'date', alignment: 'left', title: this.t('events.table.date', { defaultValue: 'Date' }) },
          { name: 'status', alignment: 'left', title: this.t('events.table.status', { defaultValue: 'Status' }) },
          { name: 'category', alignment: 'left', title: this.t('events.table.category', { defaultValue: 'Category' }) }
        ],
        sort: (row1, row2) => new Date(row1.date) - new Date(row2.date)
      });
  
      events.forEach((event, index) => {
        const status = this.getEventStatus(event);
        try {
          table.addRow({
            index: index + 1,
            title: event.title || 'N/A',
            venue: event.venue || 'N/A',
            city: event.city || 'N/A',
            date: event.startTime ? event.startTime.toLocaleString() : 'N/A',
            status: status.status,
            category: event.category ? event.category.charAt(0).toUpperCase() + event.category.slice(1) : 'N/A'
          }, { color: status.color });
        } catch (rowError) {
          console.error(chalk.red(`Error adding event #${index + 1} to table`), rowError.message);
        }
      });
  
      table.printTable();
    } catch (error) {
      console.error(chalk.red('Error displaying events table:'), error.message);
      // Log the basic event data as a fallback
      console.log(chalk.yellow('Events (fallback display):'));
      events.forEach((event, index) => {
        console.log(`${index + 1}. ${event.title || 'N/A'} - ${event.venue || 'N/A'} (${event.startTime ? event.startTime.toLocaleString() : 'N/A'})`);
      });
    }
  };

  async checkDueEvents() {
    if (!this.currentUser) return;
  
    try {
      const now = new Date();
      const upcomingEvents = await this.eventsCollection.find({
        creatorId: this.currentUser._id,
        startTime: { $gte: now }
      }).sort({ startTime: 1 }).toArray();
  
      const dueEvents = upcomingEvents.filter(event => {
        const eventDate = new Date(event.startTime);
        const oneDayBefore = new Date(eventDate);
        oneDayBefore.setDate(oneDayBefore.getDate() - 1);
        return now >= oneDayBefore;
      });
  
      if (dueEvents.length > 0) {
        // Use a default message if translation is missing
        const dueMessage = this.t('notifications.due_events', { defaultValue: 'You have upcoming events due soon' });
        console.log(chalk.yellow.bold('\n⚠️ ' + dueMessage));
        
        try {
          this.displayEventsTable(dueEvents, 'Your Due Events');
        } catch (displayError) {
          console.error(chalk.red('Error displaying due events table:'), displayError.message);
        }
      }
  
      const overdueEvents = await this.eventsCollection.find({
        creatorId: this.currentUser._id,
        startTime: { $lt: now }
      }).sort({ startTime: 1 }).toArray();
  
      if (overdueEvents.length > 0) {
        // Use a default message if translation is missing
        const overdueMessage = this.t('notifications.overdue_events', { defaultValue: 'You have events that are now past due' });
        console.log(chalk.red.bold('\n⚠️ ' + overdueMessage));
        
        try {
          this.displayEventsTable(overdueEvents, 'Your Overdue Events');
        } catch (displayError) {
          console.error(chalk.red('Error displaying overdue events table:'), displayError.message);
        }
      }
    } catch (error) {
      console.error(chalk.red('Failed to check for due events:'), error.message);
      // Swallow the error to prevent it from crashing the app
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
        await this.checkDueEvents();
      } else {
        console.log(chalk.red(this.t('errors.invalid_password')));
      }
    } catch (error) {
      console.error(chalk.red(this.t('errors.login_failed')), error.message);
      throw error; // Re-throw to be caught by mainMenu's try-catch
    }
};
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

  async getLocalCoordinates(locationName) {
    const localCoordinates = {
      'kigali': [30.0619, -1.9441],
      'nairobi': [36.8219, -1.2921],
      'kampala': [32.5825, 0.3136],
      'dar es salaam': [39.2083, -6.7924],
      'bujumbura': [29.3599, -3.3822],
      'goma': [29.2284, -1.6792],
      'butare': [29.7439, -2.5967],
      'gitarama': [29.7566, -2.0744],
      'ruhengeri': [29.6344, -1.4998],
      'musanze': [29.6344, -1.4998],
      'gisenyi': [29.2564, -1.7028],
      'kibuye': [29.3478, -2.0606],
      'mombasa': [39.6682, -4.0435],
      'kisumu': [34.7617, -0.0917],
      'nakuru': [36.0665, -0.3031],
      'eldoret': [35.2699, 0.5143],
      'entebbe': [32.4637, 0.0512],
      'jinja': [33.2062, 0.4244],
      'mbale': [34.1754, 1.0644],
      'gulu': [32.2999, 2.7746],
      'dodoma': [35.7418, -6.1629],
      'arusha': [36.6830, -3.3869],
      'mwanza': [32.8987, -2.5167],
      'zanzibar': [39.2083, -6.1659]
    };

    const normalizedLocation = locationName.toLowerCase().trim();
    return localCoordinates[normalizedLocation] || [30.0619, -1.9441];
  }

  async geocodeLocation(location) {
    try {
      const localCoords = await this.getLocalCoordinates(location);
      if (localCoords) {
        return localCoords;
      }

      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`,
        { headers: { 'User-Agent': 'EventLocatorApp/1.0' } }
      );
      
      if (response.data && response.data.length > 0) {
        return [parseFloat(response.data[0].lon), parseFloat(response.data[0].lat)];
      }
      
      return [30.0619, -1.9441];
    } catch (error) {
      console.error(chalk.yellow(this.t('errors.geocode_fallback')));
      return [30.0619, -1.9441];
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
        const coordinates = await this.getLocalCoordinates(searchCriteria.query);
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

      this.displayEventsTable(events, this.t('search.results_title', { 
        count: events.length,
        query: searchCriteria.query
      }));
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

      this.displayEventsTable(events, this.t('events.your_events_title', { 
        count: events.length 
      }));
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
        try {
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
        } catch (error) {
            console.error(chalk.red('Menu operation failed:'), error);
            // Continue to next iteration of the loop
        }
    }
}
async close() {
  await this.client.close();
  await this.redisClient.quit();
  }
}

module.exports = EventLocatorApp;

