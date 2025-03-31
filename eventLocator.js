require('dotenv').config();
const inquirer = require('inquirer');
const chalk = require('chalk');
const bcrypt = require('bcrypt');
const { MongoClient } = require('mongodb');
const Redis = require('redis');
const axios = require('axios');

// ==================== Translation System ====================
const translations = {
  en: {
    welcome: "Welcome to Event Locator!",
    continuing: "Continuing in English...",
    select_language: "Please select your preferred language:",
    what_to_do: "What would you like to do?",
    menu_options: {
      register: "Register",
      login: "Login",
      create_event: "Create Event",
      search_events: "Search Events",
      view_events: "View My Events",
      exit: "Exit"
    },
    registration: {
      username: "Choose a username:",
      username_validation: "Username must be at least 3 characters",
      email: "Enter your email:",
      email_validation: "Invalid email format",
      password: "Choose a password:",
      password_validation: "Password must be at least 8 characters",
      categories: "Select event categories of interest:",
      success: "✓ User {username} registered successfully!"
    },
    login: {
      email: "Enter your email:",
      password: "Enter your password:",
      welcome: "✓ Welcome, {username}!",
      not_found: "✗ User not found",
      invalid_password: "✗ Invalid password",
      failed: "✗ Login failed:"
    },
    events: {
      title: "Event Title:",
      description: "Event Description:",
      category: "Event Category:",
      country: "Country:",
      city: "City:",
      venue: "Venue or Address:",
      start_time: "Start Time (YYYY-MM-DD HH:MM):",
      created: "✓ Event \"{title}\" created at {venue}, {city}!",
      no_events: "No events found matching your criteria.",
      my_events: "✓ Your {count} events:",
      event_details: `
{title}
📍 {venue}, {city}, {country}
🗓  {time}
🏷  {category}`
    },
    errors: {
      login_required: "✗ Please login first",
      event_creation_failed: "✗ Event creation failed:",
      geocode_failed: "⚠ Could not geocode {location}, using default coordinates"
    },
    validation: {
      required: "This field is required",
      date_format: "Invalid date format"
    }
  },
  fr: {
    welcome: "Bienvenue sur Event Locator!",
    continuing: "Continuer en français...",
    select_language: "Veuillez sélectionner votre langue préférée:",
    what_to_do: "Que souhaitez-vous faire?",
    menu_options: {
      register: "S'inscrire",
      login: "Se connecter",
      create_event: "Créer un événement",
      search_events: "Rechercher des événements",
      view_events: "Voir mes événements",
      exit: "Sortie"
    },
    registration: {
      username: "Choisissez un nom d'utilisateur:",
      username_validation: "Le nom d'utilisateur doit comporter au moins 3 caractères",
      email: "Entrez votre email:",
      email_validation: "Format d'email invalide",
      password: "Choisissez un mot de passe:",
      password_validation: "Le mot de passe doit comporter au moins 8 caractères",
      categories: "Sélectionnez les catégories d'événements qui vous intéressent:",
      success: "✓ Utilisateur {username} inscrit avec succès!"
    },
    login: {
      email: "Entrez votre email:",
      password: "Entrez votre mot de passe:",
      welcome: "✓ Bienvenue, {username}!",
      not_found: "✗ Utilisateur non trouvé",
      invalid_password: "✗ Mot de passe invalide",
      failed: "✗ Échec de la connexion:"
    },
    events: {
      title: "Titre de l'événement:",
      description: "Description de l'événement:",
      category: "Catégorie d'événement:",
      country: "Pays:",
      city: "Ville:",
      venue: "Lieu ou adresse:",
      start_time: "Heure de début (AAAA-MM-JJ HH:MM):",
      created: "✓ Événement \"{title}\" créé à {venue}, {city}!",
      no_events: "Aucun événement trouvé correspondant à vos critères.",
      my_events: "✓ Vos {count} événements:",
      event_details: `
{title}
📍 {venue}, {city}, {country}
🗓  {time}
🏷  {category}`
    },
    errors: {
      login_required: "✗ Veuillez d'abord vous connecter",
      event_creation_failed: "✗ Échec de la création de l'événement:",
      geocode_failed: "⚠ Impossible de géocoder {location}, utilisation des coordonnées par défaut"
    },
    validation: {
      required: "Ce champ est obligatoire",
      date_format: "Format de date invalide"
    }
  },
  ki: {
    welcome: "Murakaza neza kuri Event Locator!",
    continuing: "Gukomeza mu Kinyarwanda...",
    select_language: "Hitamo ururimi ushaka:",
    what_to_do: "Urashaka gukora iki?",
    menu_options: {
      register: "Iyandikishe",
      login: "Injira",
      create_event: "Kora ikirango",
      search_events: "Shakisha ibirango",
      view_events: "Reba ibirango byanjye",
      exit: "Gusohoka"
    },
    registration: {
      username: "Hitamo izina ukoresha:",
      username_validation: "Izina ukoresha rigomba kuba rirenze inyuguti 3",
      email: "Andika imeri yawe:",
      email_validation: "Imiterere y'imeri ntabwo ari yo",
      password: "Hitamo ijambo ry'ibanga:",
      password_validation: "Ijambo ry'ibanga rigomba kuba rirenze inyuguti 8",
      categories: "Hitamo ibyiciro by'ibirango ushaka:",
      success: "✓ {username} yandikishijwe neza!"
    },
    login: {
      email: "Injiza imeri yawe:",
      password: "Injiza ijambo ry'ibanga:",
      welcome: "✓ Murakaza neza, {username}!",
      not_found: "✗ Umukiriya ntabwo yabonetse",
      invalid_password: "✗ Ijambo ry'ibanga sibyo",
      failed: "✗ Kwinjira byanze:"
    },
    events: {
      title: "Umutwe w'ikirango:",
      description: "Ibisobanuro by'ikirango:",
      category: "Icyiciro cy'ikirango:",
      country: "Igihugu:",
      city: "Umujyi:",
      venue: "Aho irango rizabera:",
      start_time: "Igihe cy'itangiriro (YYYY-MM-DD HH:MM):",
      created: "✓ Ikirango \"{title}\" cyakozwe kuri {venue}, {city}!",
      no_events: "Nta birango byabonetse bihuye n'ibisabwa.",
      my_events: "✓ Ibirango {count} byawe:",
      event_details: `
{title}
📍 {venue}, {city}, {country}
🗓  {time}
🏷  {category}`
    },
    errors: {
      login_required: "✗ Nyamuneka winjire mbere",
      event_creation_failed: "✗ Gukora ikirango byanze:",
      geocode_failed: "⚠ Ntago birashoboka kubona aho {location} iri, ukoresha imibare y'ibanze"
    },
    validation: {
      required: "Iki cyuguti ntago kirenze",
      date_format: "Imiterere y'itariki ntabwo ari yo"
    }
  },
  sw: {
    welcome: "Karibu kwenye Event Locator!",
    continuing: "Endelea kwa Kiswahili...",
    select_language: "Tafadhali chagua lugha unayopenda:",
    what_to_do: "Ungependa kufanya nini?",
    menu_options: {
      register: "Jisajili",
      login: "Ingia",
      create_event: "Unda hafla",
      search_events: "Tafuta hafla",
      view_events: "Tazama hafla zangu",
      exit: "Ondoka"
    },
    registration: {
      username: "Chagua jina la mtumiaji:",
      username_validation: "Jina la mtumiaji lazima liwe na herufi 3 au zaidi",
      email: "Weka barua pepe yako:",
      email_validation: "Muundo wa barua pepe sio sahihi",
      password: "Chagua nenosiri:",
      password_validation: "Nenosiri lazima iwe na herufi 8 au zaidi",
      categories: "Chagua aina za hafla unayopenda:",
      success: "✓ Mtumiaji {username} amesajiliwa kikamilifu!"
    },
    login: {
      email: "Weka barua pepe yako:",
      password: "Weka nenosiri lako:",
      welcome: "✓ Karibu, {username}!",
      not_found: "✗ Mtumiaji hajapatikana",
      invalid_password: "✗ Nenosiri si sahihi",
      failed: "✗ Kuingia hakufanikiwa:"
    },
    events: {
      title: "Kichwa cha hafla:",
      description: "Maelezo ya hafla:",
      category: "Aina ya hafla:",
      country: "Nchi:",
      city: "Mji:",
      venue: "Mahali au anwani:",
      start_time: "Wakati wa kuanza (YYYY-MM-DD HH:MM):",
      created: "✓ Hafla \"{title}\" imeundwa {venue}, {city}!",
      no_events: "Hakuna hafla zilizopatikana kulingana na vigezo vyako.",
      my_events: "✓ Hafla zako {count}:",
      event_details: `
{title}
📍 {venue}, {city}, {country}
🗓  {time}
🏷  {category}`
    },
    errors: {
      login_required: "✗ Tafadhali ingia kwanza",
      event_creation_failed: "✗ Kuunda hafla hakufanikiwa:",
      geocode_failed: "⚠ Haikuwezekana kupata eneo la {location}, kutumia viwango vya kawaida"
    },
    validation: {
      required: "Sehemu hii inahitajika",
      date_format: "Muundo wa tarehe sio sahihi"
    }
  }
};

function t(lang, key, variables = {}) {
  const keys = key.split('.');
  let translation = translations[lang];
  
  for (const k of keys) {
    translation = translation?.[k];
    if (!translation) break;
  }
  
  if (!translation) {
    const fallbackKeys = key.split('.');
    let fallback = translations['en'];
    for (const k of fallbackKeys) {
      fallback = fallback?.[k];
      if (!fallback) return key;
    }
    translation = fallback;
  }
  
  if (typeof translation === 'string') {
    for (const [varName, value] of Object.entries(variables)) {
      translation = translation.replace(new RegExp(`{${varName}}`, 'g'), value);
    }
  }
  
  return translation || key;
}

// ==================== Event Locator App ====================
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
    this.preferredLanguage = 'en';
    
    // Location data
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
          quit: () => Promise.resolve(),
          isFake: true
        };
      }
    } catch (error) {
      console.error(chalk.red('✗ Initialization error:'), error);
      process.exit(1);
    }
  }

  async showWelcomeMessage() {
    console.log(chalk.green(`\n${t(this.preferredLanguage, 'welcome')}`));
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log(chalk.yellow(t(this.preferredLanguage, 'continuing')));
  }

  async selectLanguage() {
    const { language } = await inquirer.prompt({
      type: 'list',
      name: 'language',
      message: t(this.preferredLanguage, 'select_language'),
      choices: [
        { name: 'English', value: 'en' },
        { name: 'Kinyarwanda', value: 'ki' },
        { name: 'Swahili', value: 'sw' },
        { name: 'French', value: 'fr' }
      ]
    });
    
    this.preferredLanguage = language;
    await this.showWelcomeMessage();
  }

  async mainMenu() {
    const { action } = await inquirer.prompt({
      type: 'list',
      name: 'action',
      message: t(this.preferredLanguage, 'what_to_do'),
      choices: [
        t(this.preferredLanguage, 'menu_options.register'),
        t(this.preferredLanguage, 'menu_options.login'),
        t(this.preferredLanguage, 'menu_options.create_event'),
        t(this.preferredLanguage, 'menu_options.search_events'),
        t(this.preferredLanguage, 'menu_options.view_events'),
        t(this.preferredLanguage, 'menu_options.exit')
      ]
    });

    switch (action) {
      case t(this.preferredLanguage, 'menu_options.register'):
        await this.registerUser();
        break;
      case t(this.preferredLanguage, 'menu_options.login'):
        await this.loginUser();
        break;
      case t(this.preferredLanguage, 'menu_options.create_event'):
        await this.createEvent();
        break;
      case t(this.preferredLanguage, 'menu_options.search_events'):
        await this.searchEvents();
        break;
      case t(this.preferredLanguage, 'menu_options.view_events'):
        await this.viewMyEvents();
        break;
      case t(this.preferredLanguage, 'menu_options.exit'):
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
        message: t(this.preferredLanguage, 'registration.username'),
        validate: input => input.length > 2 ? true : t(this.preferredLanguage, 'registration.username_validation')
      },
      {
        type: 'input',
        name: 'email',
        message: t(this.preferredLanguage, 'registration.email'),
        validate: input => /\S+@\S+\.\S+/.test(input) ? true : t(this.preferredLanguage, 'registration.email_validation')
      },
      {
        type: 'password',
        name: 'password',
        message: t(this.preferredLanguage, 'registration.password'),
        validate: input => input.length >= 8 ? true : t(this.preferredLanguage, 'registration.password_validation')
      },
      {
        type: 'checkbox',
        name: 'categories',
        message: t(this.preferredLanguage, 'registration.categories'),
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

      const result = await this.usersCollection.insertOne(user);
      console.log(chalk.green(t(this.preferredLanguage, 'registration.success', { username: userData.username })));
      
      // Automatically log in the user after registration
      this.currentUser = user;
      await this.showWelcomeMessage();
    } catch (error) {
      if (error.code === 11000) {
        console.error(chalk.red(t(this.preferredLanguage, 'errors.duplicate_user')));
      } else {
        console.error(chalk.red(t(this.preferredLanguage, 'errors.registration_failed')), error.message);
      }
    }
  }

  async loginUser() {
    const credentials = await inquirer.prompt([
      {
        type: 'input',
        name: 'email',
        message: t(this.preferredLanguage, 'login.email')
      },
      {
        type: 'password',
        name: 'password',
        message: t(this.preferredLanguage, 'login.password')
      }
    ]);

    try {
      const user = await this.usersCollection.findOne({ email: credentials.email });
      if (!user) {
        console.log(chalk.red(t(this.preferredLanguage, 'login.not_found')));
        return;
      }

      const passwordMatch = await bcrypt.compare(credentials.password, user.password);
      if (passwordMatch) {
        this.currentUser = user;
        this.preferredLanguage = user.preferredLanguage;
        console.log(chalk.green(t(this.preferredLanguage, 'login.welcome', { username: user.username })));
        await this.showWelcomeMessage();
      } else {
        console.log(chalk.red(t(this.preferredLanguage, 'login.invalid_password')));
      }
    } catch (error) {
      console.error(chalk.red(t(this.preferredLanguage, 'login.failed')), error.message);
    }
  }

  async createEvent() {
    if (!this.currentUser) {
      console.log(chalk.red(t(this.preferredLanguage, 'errors.login_required')));
      return;
    }

    const eventData = await inquirer.prompt([
      {
        type: 'input',
        name: 'title',
        message: t(this.preferredLanguage, 'events.title'),
        validate: input => input.length > 0 ? true : t(this.preferredLanguage, 'validation.required')
      },
      {
        type: 'input',
        name: 'description',
        message: t(this.preferredLanguage, 'events.description')
      },
      {
        type: 'list',
        name: 'category',
        message: t(this.preferredLanguage, 'events.category'),
        choices: ['Music', 'Sports', 'Technology', 'Education', 'Arts', 'Business']
      },
      {
        type: 'list',
        name: 'country',
        message: t(this.preferredLanguage, 'events.country'),
        choices: this.countries
      },
      {
        type: 'list',
        name: 'city',
        message: t(this.preferredLanguage, 'events.city'),
        choices: (answers) => this.citiesByCountry[answers.country] || [t(this.preferredLanguage, 'errors.city_not_listed')]
      },
      {
        type: 'input',
        name: 'venue',
        message: t(this.preferredLanguage, 'events.venue'),
        validate: input => input.length > 0 ? true : t(this.preferredLanguage, 'validation.required')
      },
      {
        type: 'input',
        name: 'startTime',
        message: t(this.preferredLanguage, 'events.start_time'),
        validate: input => !isNaN(Date.parse(input)) ? true : t(this.preferredLanguage, 'validation.date_format')
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
      console.log(chalk.green(t(this.preferredLanguage, 'events.created', { 
        title: eventData.title,
        venue: eventData.venue,
        city: eventData.city
      })));
      
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
      console.error(chalk.red(t(this.preferredLanguage, 'errors.event_creation_failed')), error.message);
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
      console.error(chalk.yellow(t(this.preferredLanguage, 'errors.geocode_failed', { location })));
      return [30.0619, -1.9441]; // Default to Kigali coordinates
    }
  }

  async searchEvents() {
    const searchCriteria = await inquirer.prompt([
      {
        type: 'list',
        name: 'searchType',
        message: t(this.preferredLanguage, 'events.search_by'),
        choices: [
          t(this.preferredLanguage, 'events.search_types.city'),
          t(this.preferredLanguage, 'events.search_types.country'),
          t(this.preferredLanguage, 'events.search_types.venue')
        ]
      },
      {
        type: 'input',
        name: 'location',
        message: answers => {
          const searchType = answers.searchType.toLowerCase();
          return t(this.preferredLanguage, 'events.search_prompt', { searchType });
        },
        validate: input => input.length > 0 ? true : t(this.preferredLanguage, 'validation.required')
      },
      {
        type: 'number',
        name: 'radius',
        message: t(this.preferredLanguage, 'events.search_radius'),
        default: 0
      },
      {
        type: 'checkbox',
        name: 'categories',
        message: t(this.preferredLanguage, 'events.filter_categories'),
        choices: ['Music', 'Sports', 'Technology', 'Education', 'Arts', 'Business']
      }
    ]);

    try {
      let query = {};
      
      // Text-based search
      if (searchCriteria.searchType === t(this.preferredLanguage, 'events.search_types.city')) {
        query.city = new RegExp(searchCriteria.location, 'i');
      } else if (searchCriteria.searchType === t(this.preferredLanguage, 'events.search_types.country')) {
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
        console.log(chalk.yellow(t(this.preferredLanguage, 'events.no_events')));
        return;
      }

      console.log(chalk.green(t(this.preferredLanguage, 'events.found_events', { count: events.length })));
      events.forEach(event => {
        console.log(chalk.cyan(t(this.preferredLanguage, 'events.event_details', {
          title: event.title,
          venue: event.venue,
          city: event.city,
          country: event.country,
          time: event.startTime.toLocaleString(),
          category: event.category.charAt(0).toUpperCase() + event.category.slice(1)
        })));
      });
    } catch (error) {
      console.error(chalk.red(t(this.preferredLanguage, 'errors.search_failed')), error.message);
    }
  }

  async viewMyEvents() {
    if (!this.currentUser) {
      console.log(chalk.red(t(this.preferredLanguage, 'errors.login_required')));
      return;
    }

    try {
      const events = await this.eventsCollection.find({ 
        creatorId: this.currentUser._id 
      }).sort({ startTime: 1 }).toArray();

      if (events.length === 0) {
        console.log(chalk.yellow(t(this.preferredLanguage, 'events.no_my_events')));
        return;
      }

      console.log(chalk.green(t(this.preferredLanguage, 'events.my_events', { count: events.length })));
      events.forEach(event => {
        console.log(chalk.cyan(t(this.preferredLanguage, 'events.event_details', {
          title: event.title,
          venue: event.venue,
          city: event.city,
          country: event.country,
          time: event.startTime.toLocaleString(),
          category: event.category.charAt(0).toUpperCase() + event.category.slice(1)
        })));
      });
    } catch (error) {
      console.error(chalk.red(t(this.preferredLanguage, 'errors.view_events_failed')), error.message);
    }
  }

  async close() {
    await this.client.close();
    if (!this.redisClient.isFake) {
      await this.redisClient.quit();
    }
  }
}

// ==================== Main Execution ====================
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