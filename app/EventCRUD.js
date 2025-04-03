const chalk = require('chalk');
const inquirer = require('inquirer');
const { MongoClient, ObjectId } = require('mongodb');

class EventCRUD {
  constructor(app) {
    this.app = app;
  }

  async updateEvent() {
    if (!this.app.currentUser) {
      console.log(chalk.red(this.app.t('errors.login_required')));
      return;
    }

    try {
      // First, get the user's events
      const events = await this.app.eventsCollection.find({ 
        creatorId: this.app.currentUser._id 
      }).sort({ startTime: 1 }).toArray();

      if (events.length === 0) {
        console.log(chalk.yellow(this.app.t('events.none_created')));
        return;
      }

      // Let the user select which event to update
      const { eventToUpdate } = await inquirer.prompt({
        type: 'list',
        name: 'eventToUpdate',
        message: this.app.t('events.select_to_update'),
        choices: events.map(event => ({
          name: `${event.title} - ${event.venue}, ${event.city} (${event.startTime.toLocaleString()})`,
          value: event._id.toString()
        }))
      });

      // Get the selected event
      const selectedEvent = events.find(e => e._id.toString() === eventToUpdate);
      await this.updateEventById(selectedEvent._id);
    } catch (error) {
      console.error(chalk.red(this.app.t('errors.event_update_failed')), error.message);
    }
  }

  async deleteEvent() {
    try {
      if (!this.app.currentUser) {
        console.log(chalk.red(this.app.t('errors.login_required')));
        return;
      }
  
      // Get user's events
      const events = await this.app.eventsCollection.find({
        creatorId: this.app.currentUser._id
      }).sort({ startTime: 1 }).toArray();
  
      if (events.length === 0) {
        console.log(chalk.yellow(this.app.t('events.none_created')));
        return;
      }
  
      // Display events for selection
      const { selectedEvent } = await inquirer.prompt({
        type: 'list',
        name: 'selectedEvent',
        message: this.app.t('events.select_to_delete'),
        choices: events.map(event => ({
          name: `${event.title} - ${event.venue}, ${event.city} (${event.startTime.toLocaleString()})`,
          value: event._id.toString() // Convert ObjectId to string for selection
        }))
      });
  
      // Confirm deletion
      const { confirm } = await inquirer.prompt({
        type: 'confirm',
        name: 'confirm',
        message: this.app.t('events.confirm_delete'),
        default: false
      });
  
      if (!confirm) {
        console.log(chalk.yellow(this.app.t('events.delete_cancelled')));
        return;
      }
  
      // Convert string back to ObjectId for query
      const result = await this.app.eventsCollection.deleteOne({
        _id: new ObjectId(selectedEvent),
        creatorId: this.app.currentUser._id
      });
  
      if (result.deletedCount === 1) {
        console.log(chalk.green(this.app.t('events.deleted')));
      } else {
        console.log(chalk.red(this.app.t('errors.event_not_found')));
      }
    } catch (error) {
      console.error(chalk.red(this.app.t('errors.event_delete_failed')), error.message);
      throw error;
    }
  }
  async viewEventDetails() {
    try {
      if (!this.app.currentUser) {
        console.log(chalk.red(this.app.t('errors.login_required')));
        return;
      }
  
      const events = await this.app.eventsCollection.find({
        creatorId: this.app.currentUser._id
      }).sort({ startTime: 1 }).toArray();
  
      if (events.length === 0) {
        console.log(chalk.yellow(this.app.t('events.none_created')));
        return;
      }
  
      const { selectedEvent } = await inquirer.prompt({
        type: 'list',
        name: 'selectedEvent',
        message: this.app.t('events.select_to_view'),
        choices: events.map(event => ({
          name: `${event.title} - ${event.venue}, ${event.city} (${event.startTime.toLocaleString()})`,
          value: event._id.toString()
        }))
      });
  
      const event = await this.app.eventsCollection.findOne({
        _id: new ObjectId(selectedEvent),
        creatorId: this.app.currentUser._id
      });
  
      if (!event) {
        console.log(chalk.red(this.app.t('errors.event_not_found')));
        return;
      }
  
      // Display event details
      console.log(chalk.blue.bold('\nEvent Details:'));
      console.log(chalk.white(`Title: ${event.title}`));
      console.log(chalk.white(`Description: ${event.description || 'N/A'}`));
      console.log(chalk.white(`Venue: ${event.venue}`));
      console.log(chalk.white(`Location: ${event.city}, ${event.country}`));
      console.log(chalk.white(`Date: ${event.startTime.toLocaleString()}`));
      console.log(chalk.white(`Category: ${event.category}`));
      console.log(chalk.white(`Created: ${event.createdAt.toLocaleString()}`));
    } catch (error) {
      console.error(chalk.red(this.app.t('errors.event_view_failed')), error.message);
      throw error;
    }
  }

  async updateEventById(eventId) {
    try {
      const event = await this.app.eventsCollection.findOne({ _id: eventId });
      
      if (!event) {
        console.log(chalk.red(this.app.t('errors.event_not_found')));
        return;
      }

      if (event.creatorId.toString() !== this.app.currentUser._id.toString()) {
        console.log(chalk.red(this.app.t('errors.not_authorized')));
        return;
      }

      // Ask which fields to update
      const { fieldsToUpdate } = await inquirer.prompt({
        type: 'checkbox',
        name: 'fieldsToUpdate',
        message: this.app.t('events.fields_to_update'),
        choices: [
          { name: this.app.t('events.title'), value: 'title' },
          { name: this.app.t('events.description'), value: 'description' },
          { name: this.app.t('events.category'), value: 'category' },
          { name: this.app.t('events.venue'), value: 'venue' },
          { name: this.app.t('events.location'), value: 'location' },
          { name: this.app.t('events.start_time'), value: 'startTime' }
        ]
      });

      if (fieldsToUpdate.length === 0) {
        console.log(chalk.yellow(this.app.t('events.no_fields_selected')));
        return;
      }

      // Prepare the update object and prompts
      const updateData = {};
      const updatePrompts = [];

      // Add prompts for each selected field
      if (fieldsToUpdate.includes('title')) {
        updatePrompts.push({
          type: 'input',
          name: 'title',
          message: this.app.t('events.new_title'),
          default: event.title,
          validate: input => input.length > 0 || this.app.t('validation.required')
        });
      }

      if (fieldsToUpdate.includes('description')) {
        updatePrompts.push({
          type: 'input',
          name: 'description',
          message: this.app.t('events.new_description'),
          default: event.description
        });
      }

      if (fieldsToUpdate.includes('category')) {
        updatePrompts.push({
          type: 'list',
          name: 'category',
          message: this.app.t('events.new_category'),
          choices: ['Music', 'Sports', 'Technology', 'Education', 'Arts', 'Business'],
          default: event.category.charAt(0).toUpperCase() + event.category.slice(1)
        });
      }

      // Location update involves multiple fields
      let locationChange = false;
      if (fieldsToUpdate.includes('location')) {
        updatePrompts.push({
          type: 'list',
          name: 'country',
          message: this.app.t('events.new_country'),
          choices: this.app.countries,
          default: event.country
        });

        updatePrompts.push({
          type: 'list',
          name: 'city',
          message: this.app.t('events.new_city'),
          choices: answers => this.app.citiesByCountry[answers.country] || [this.app.t('errors.city_not_listed')],
          default: answers => {
            const cities = this.app.citiesByCountry[answers.country] || [];
            return cities.includes(event.city) ? event.city : cities[0];
          }
        });
        
        locationChange = true;
      }

      if (fieldsToUpdate.includes('venue')) {
        updatePrompts.push({
          type: 'input',
          name: 'venue',
          message: this.app.t('events.new_venue'),
          default: event.venue,
          validate: input => input.length > 0 || this.app.t('validation.required')
        });
        
        locationChange = true;
      }

      if (fieldsToUpdate.includes('startTime')) {
        updatePrompts.push({
          type: 'input',
          name: 'startTime',
          message: this.app.t('events.new_start_time'),
          default: event.startTime.toISOString().slice(0, 16).replace('T', ' '),
          validate: input => !isNaN(Date.parse(input)) || this.app.t('validation.date_format')
        });
      }

      // Get the answers for all prompts
      const updates = await inquirer.prompt(updatePrompts);

      // Apply updates to the update object
      Object.keys(updates).forEach(key => {
        if (key === 'category') {
          updateData[key] = updates[key].toLowerCase();
        } else if (key === 'startTime') {
          updateData[key] = new Date(updates[key]);
        } else if (!['country', 'city'].includes(key)) {
          updateData[key] = updates[key];
        }
      });

      // If location-related fields were updated, recalculate coordinates
      if (locationChange) {
        const country = updates.country || event.country;
        const city = updates.city || event.city;
        const venue = updates.venue || event.venue;
        
        const locationQuery = `${venue}, ${city}, ${country}`;
        const coordinates = await this.app.geocodeLocation(locationQuery);
        
        updateData.location = {
          type: 'Point',
          coordinates: coordinates
        };
        
        // Also update the country and city if they changed
        if (updates.country) updateData.country = updates.country;
        if (updates.city) updateData.city = updates.city;
      }

      // Add last updated timestamp
      updateData.updatedAt = new Date();

      // Perform the update
      await this.app.eventsCollection.updateOne(
        { _id: event._id },
        { $set: updateData }
      );

      console.log(chalk.green(this.app.t('events.updated', { title: event.title })));
    } catch (error) {
      console.error(chalk.red(this.app.t('errors.event_update_failed')), error.message);
    }
  }

  async deleteEventById(eventId) {
    try {
      const event = await this.app.eventsCollection.findOne({ _id: eventId });
      
      if (!event) {
        console.log(chalk.red(this.app.t('errors.event_not_found')));
        return;
      }

      if (event.creatorId.toString() !== this.app.currentUser._id.toString()) {
        console.log(chalk.red(this.app.t('errors.not_authorized')));
        return;
      }

      // Confirm deletion
      const { confirmDelete } = await inquirer.prompt({
        type: 'confirm',
        name: 'confirmDelete',
        message: this.app.t('events.confirm_delete'),
        default: false
      });

      if (!confirmDelete) {
        console.log(chalk.yellow(this.app.t('events.delete_cancelled')));
        return;
      }

      // Perform the deletion
      await this.app.eventsCollection.deleteOne({ _id: event._id });
      console.log(chalk.green(this.app.t('events.deleted')));
    } catch (error) {
      console.error(chalk.red(this.app.t('errors.event_delete_failed')), error.message);
    }
  }
}

module.exports = EventCRUD;