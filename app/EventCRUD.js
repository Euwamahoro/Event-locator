const chalk = require('chalk');
const inquirer = require('inquirer');

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

      // Add a cancel option
      const eventChoices = events.map(event => ({
        name: `${event.title} - ${event.venue}, ${event.city} (${event.startTime.toLocaleString()})`,
        value: event._id.toString()
      }));
      eventChoices.push({ 
        name: this.app.t('common.cancel'), 
        value: 'cancel' 
      });

      // Let the user select which event to delete
      const { eventToDelete } = await inquirer.prompt({
        type: 'list',
        name: 'eventToDelete',
        message: this.app.t('events.select_to_delete'),
        choices: eventChoices
      });

      if (eventToDelete === 'cancel') {
        console.log(chalk.yellow(this.app.t('events.delete_cancelled')));
        return;
      }

      await this.deleteEventById(this.app.db.ObjectId.createFromHexString(eventToDelete));
    } catch (error) {
      console.error(chalk.red(this.app.t('errors.event_delete_failed')), error.message);
    }
  }

  async viewEventDetails() {
    if (!this.app.currentUser) {
      console.log(chalk.red(this.app.t('errors.login_required')));
      return;
    }

    try {
      // First, get all events
      const events = await this.app.eventsCollection.find({}).sort({ startTime: 1 }).toArray();

      if (events.length === 0) {
        console.log(chalk.yellow(this.app.t('events.none_available')));
        return;
      }

      // Let the user select which event to view
      const { eventToView } = await inquirer.prompt({
        type: 'list',
        name: 'eventToView',
        message: this.app.t('events.select_to_view'),
        choices: events.map(event => ({
          name: `${event.title} - ${event.venue}, ${event.city} (${event.startTime.toLocaleString()})`,
          value: event._id.toString()
        }))
      });

      // Get the selected event
      const selectedEvent = await this.app.eventsCollection.findOne({ 
        _id: this.app.db.ObjectId.createFromHexString(eventToView) 
      });

      if (!selectedEvent) {
        console.log(chalk.red(this.app.t('errors.event_not_found')));
        return;
      }

      // Display event details
      console.log(chalk.cyan('===================='));
      console.log(chalk.green(this.app.t('events.detail_view.title', { title: selectedEvent.title })));
      console.log(chalk.cyan('===================='));
      console.log(chalk.yellow(this.app.t('events.detail_view.description')), selectedEvent.description || this.app.t('common.not_provided'));
      console.log(chalk.yellow(this.app.t('events.detail_view.category')), selectedEvent.category.charAt(0).toUpperCase() + selectedEvent.category.slice(1));
      console.log(chalk.yellow(this.app.t('events.detail_view.location')), `${selectedEvent.venue}, ${selectedEvent.city}, ${selectedEvent.country}`);
      console.log(chalk.yellow(this.app.t('events.detail_view.coordinates')), `${selectedEvent.location.coordinates[1]}, ${selectedEvent.location.coordinates[0]}`);
      console.log(chalk.yellow(this.app.t('events.detail_view.start_time')), selectedEvent.startTime.toLocaleString());
      console.log(chalk.yellow(this.app.t('events.detail_view.created')), selectedEvent.createdAt.toLocaleString());
      
      if (selectedEvent.updatedAt) {
        console.log(chalk.yellow(this.app.t('events.detail_view.updated')), selectedEvent.updatedAt.toLocaleString());
      }
      
      // Display a map link
      const mapUrl = `https://www.openstreetmap.org/?mlat=${selectedEvent.location.coordinates[1]}&mlon=${selectedEvent.location.coordinates[0]}&zoom=15`;
      console.log(chalk.yellow(this.app.t('events.detail_view.map_link')), mapUrl);
      console.log(chalk.cyan('===================='));

      // If the user is the creator, offer update or delete options
      if (selectedEvent.creatorId.toString() === this.app.currentUser._id.toString()) {
        const { action } = await inquirer.prompt({
          type: 'list',
          name: 'action',
          message: this.app.t('events.creator_options'),
          choices: [
            { name: this.app.t('events.update'), value: 'update' },
            { name: this.app.t('events.delete'), value: 'delete' },
            { name: this.app.t('common.back'), value: 'back' }
          ]
        });

        if (action === 'update') {
          await this.updateEventById(selectedEvent._id);
        } else if (action === 'delete') {
          await this.deleteEventById(selectedEvent._id);
        }
      }
    } catch (error) {
      console.error(chalk.red(this.app.t('errors.event_view_failed')), error.message);
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