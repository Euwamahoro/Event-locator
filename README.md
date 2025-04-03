# Event Locator CLI
![demo video](https://somup.com/cTferdsoPE) 
![follow the project documentation:](https://docs.google.com/document/d/1HSgtptW4jJejT6d0w088pp0r_d7X7rnv0eETFJMNpYI/edit?usp=sharing)


![Event Locator CLI](https://via.placeholder.com/800x200?text=Event+Locator+CLI+Application)

A command-line application for creating, managing, and finding events with multi-language support.

## Table of Contents
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Quick Start](#quick-start)
- [Usage Guide](#usage-guide)
  - [User Registration](#1-user-registration)
  - [User Login](#2-user-login)
  - [Creating Events](#3-creating-events)
  - [Viewing Events](#4-viewing-events)
  - [Updating Events](#5-updating-events)
  - [Deleting Events](#6-deleting-events)
  - [Searching Events](#7-searching-events)
- [Troubleshooting](#troubleshooting)
- [Support](#support)
- [Contributing](#contributing)
- [License](#license)

## Features

- ✨ **User Management**: Register and authenticate users
- 📝 **Event Management**: Create, update, and delete events
- 🔎 **Advanced Search**: Find events by location, category, or date
- 🌐 **Multi-language**: Supports multiple languages (English default)
- ⏳ **Event Status**: Tracks upcoming, due, and overdue events
- 📊 **Interactive UI**: Easy-to-use terminal interface
- 🔐 **Security**: JWT authentication for all operations

## Prerequisites

Ensure you have these installed:

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm (v6 or higher) or yarn
- Google Translate API key (optional, for auto-translation)

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/your-username/event-locator.git
   cd event-locator

   Create .env file:

env

MONGODB_URI=mongodb://localhost:27017/event-locator
JWT_SECRET=your_secure_jwt_secret
USE_AUTO_TRANSLATE=true
GOOGLE_TRANSLATE_API_KEY=your_api_key_here
Initialize database:



npm run db:init
Start the application:



npm start
Configuration
Customize these environment variables in your .env file:

Variable	Description	Example
MONGODB_URI	MongoDB connection string	mongodb://localhost:27017/event-locator
JWT_SECRET	Secret for JWT tokens	your_secure_jwt_secret
USE_AUTO_TRANSLATE	Enable auto-translation	true or false
GOOGLE_TRANSLATE_API_KEY	Google Cloud API key	your_api_key_here
Quick Start
Start the app:



npm start
Register a new user:


? What would you like to do? Register
? Choose a username: EventUser
? Enter your email: user@example.com
? Choose a password: [hidden]
? Select event categories: Music, Technology
Create your first event:


? What would you like to do? Create Event
? Event Title: My Tech Meetup
? Description: Monthly tech discussion
? Category: Technology
? Country: United States
? City: New York
? Venue: Tech Hub
? Start Time: 2025-05-20 18:00
Usage Guide
1. User Registration


? What would you like to do? Register
? Choose a username: [your_username]
? Enter your email: [your_email@example.com]
? Choose a password: [hidden]
? Select event categories: [use space to select]
2. User Login


? What would you like to do? Login
? Email: [your_email@example.com]
? Password: [hidden]
3. Creating Events


? What would you like to do? Create Event
? Event Title: [Event Name]
? Description: [Event Description]
? Category: [Select from list]
? Country: [Country Name]
? City: [City Name]
? Venue: [Venue Name]
? Start Time: [YYYY-MM-DD HH:MM]
4. Viewing Events


? What would you like to do? View My Events
Example output:


┌───┬───────────────┬─────────┬────────────┬────────────────────────┬──────────┬────────────┐
│ # │ Title         │ Venue   │ City       │ Date                   │ Status   │ Category   │
├───┼───────────────┼─────────┼────────────┼────────────────────────┼──────────┼────────────┤
│ 1 │ My Tech Meetup│ Tech Hub│ New York   │ 05/20/2025, 6:00:00 PM │ Upcoming │ Technology │
└───┴───────────────┴─────────┴────────────┴────────────────────────┴──────────┴────────────┘
5. Updating Events


? What would you like to do? Update Event
? Select event to update: [Choose from list]
? Fields to update: [Select fields]
? New Title: [Updated Title]
? New Description: [Updated Description]
? New Start Time: [YYYY-MM-DD HH:MM]
6. Deleting Events


? What would you like to do? Delete Event
? Select event to delete: [Choose from list]
? Confirm deletion: Yes
7. Searching Events


? What would you like to do? Search Events
? Search by: [city/country/venue]
? Enter search query: [Your search term]
Troubleshooting
Error Message	Solution
"User not found"	Verify email or register first
"Invalid password"	Check your password or reset it
"this.updateEventById is not a function"	Reinstall dependencies (npm install)
Database connection errors	Check MongoDB is running and .env settings
Missing translations	Set USE_AUTO_TRANSLATE=true in .env
Support
For additional help, please contact:

Email: support@eventlocator.com


Contributing
Fork the repository

Create your feature branch (git checkout -b feature/NewFeature)

Commit your changes (git commit -m 'Add NewFeature')

Push to the branch (git push origin feature/NewFeature)

Open a Pull Request

License
This project is licensed under the MIT License - see the LICENSE file for details.

Happy Event Planning! 🎉
