import React, { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authAPI, calendarAPI } from '../utils/api';

const emptyForm = {
  title: '',
  description: '',
  startAt: '',
  endAt: '',
  allDay: false,
  location: '',
  color: '',
  recurrence: 'none',
  reminderMinutes: ''
};

const toDateTimeInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().slice(0, 16);
};

function Calendar() {
  const [searchParams] = useSearchParams();
  const requestedUser = (searchParams.get('user') || '').trim();
  const token = localStorage.getItem('token');
  const isAuthenticated = Boolean(token);

  const [loading, setLoading] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [calendar, setCalendar] = useState(null);
  const [events, setEvents] = useState([]);
  const [owner, setOwner] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingEventId, setEditingEventId] = useState(null);

  const dateRange = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    const end = new Date();
    end.setDate(end.getDate() + 120);
    return { from: start.toISOString(), to: end.toISOString() };
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingEventId(null);
  };

  const loadCalendar = useCallback(async () => {
    if (!isAuthenticated && !requestedUser) {
      setErrorMessage('Sign in to manage your calendar, or open /calendar?user=<username> to view a public calendar.');
      setCalendar(null);
      setEvents([]);
      setOwner(null);
      setIsOwner(false);
      return;
    }

    setLoading(true);
    setLoadingEvents(true);
    setErrorMessage('');

    try {
      if (!requestedUser) {
        const [{ data: calendarData }, { data: eventsData }, { data: profileData }] = await Promise.all([
          calendarAPI.getMyCalendar(),
          calendarAPI.getMyEvents(dateRange),
          authAPI.getProfile()
        ]);
        setCalendar(calendarData.calendar);
        setEvents(eventsData.events || []);
        setOwner({
          username: profileData?.user?.username,
          realName: profileData?.user?.realName
        });
        setIsOwner(true);
      } else {
        const [{ data: calendarData }, { data: eventsData }] = await Promise.all([
          calendarAPI.getUserCalendar(requestedUser),
          calendarAPI.getUserCalendarEvents(requestedUser, dateRange)
        ]);
        setCalendar(calendarData.calendar);
        setEvents(eventsData.events || []);
        setOwner(calendarData.owner || null);
        setIsOwner(Boolean(calendarData.isOwner));
      }
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to load calendar';
      setErrorMessage(message);
      setCalendar(null);
      setEvents([]);
      toast.error(message);
    } finally {
      setLoading(false);
      setLoadingEvents(false);
    }
  }, [dateRange, isAuthenticated, requestedUser]);

  React.useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  const handleSettingsChange = (name, value) => {
    setCalendar((prev) => ({ ...prev, [name]: value }));
  };

  const saveSettings = async () => {
    if (!isOwner || !calendar) return;

    try {
      const payload = {
        title: calendar.title,
        description: calendar.description,
        guestVisibility: calendar.guestVisibility,
        timezone: calendar.timezone,
        defaultView: calendar.defaultView
      };
      const { data } = await calendarAPI.updateMyCalendarSettings(payload);
      setCalendar(data.calendar);
      toast.success('Calendar settings saved');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save settings');
    }
  };

  const handleFormChange = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEdit = (event) => {
    setEditingEventId(event._id);
    setForm({
      title: event.title || '',
      description: event.description || '',
      startAt: toDateTimeInput(event.startAt),
      endAt: toDateTimeInput(event.endAt),
      allDay: Boolean(event.allDay),
      location: event.location || '',
      color: event.color || '',
      recurrence: event.recurrence || 'none',
      reminderMinutes: Number.isInteger(event.reminderMinutes) ? String(event.reminderMinutes) : ''
    });
  };

  const handleSubmitEvent = async (event) => {
    event.preventDefault();
    if (!isOwner) return;

    const payload = {
      ...form,
      reminderMinutes: form.reminderMinutes === '' ? null : Number(form.reminderMinutes)
    };

    try {
      if (editingEventId) {
        await calendarAPI.updateEvent(editingEventId, payload);
        toast.success('Event updated');
      } else {
        await calendarAPI.createEvent(payload);
        toast.success('Event created');
      }
      resetForm();
      await loadCalendar();
    } catch (error) {
      toast.error(error.response?.data?.error || error.response?.data?.errors?.[0]?.msg || 'Failed to save event');
    }
  };

  const handleDelete = async (eventId) => {
    if (!isOwner) return;

    try {
      await calendarAPI.deleteEvent(eventId);
      toast.success('Event deleted');
      await loadCalendar();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete event');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Calendar</h2>
            <p className="text-sm text-gray-600 mt-1">
              {owner?.username ? `Viewing @${owner.username}'s calendar` : 'Personal calendar'}
            </p>
          </div>
          {!requestedUser ? null : (
            <Link to="/calendar" className="text-sm text-blue-600 hover:text-blue-700">Back to My Calendar</Link>
          )}
        </div>

        {errorMessage ? (
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{errorMessage}</div>
        ) : null}

        {calendar && !loading ? (
          <div className="mt-4 text-sm text-gray-700 space-y-1">
            <p><span className="font-medium">Title:</span> {calendar.title}</p>
            <p><span className="font-medium">Timezone:</span> {calendar.timezone}</p>
            <p><span className="font-medium">Visibility:</span> {calendar.guestVisibility}</p>
            {calendar.description ? <p><span className="font-medium">Description:</span> {calendar.description}</p> : null}
          </div>
        ) : null}
      </div>

      {calendar && isOwner ? (
        <section className="bg-white rounded-xl shadow p-6 border border-gray-100 space-y-4">
          <h3 className="text-lg font-medium">Calendar Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              className="border rounded px-3 py-2"
              value={calendar.title || ''}
              onChange={(event) => handleSettingsChange('title', event.target.value)}
              placeholder="Calendar title"
            />
            <input
              className="border rounded px-3 py-2"
              value={calendar.timezone || ''}
              onChange={(event) => handleSettingsChange('timezone', event.target.value)}
              placeholder="Timezone (e.g., UTC, America/New_York)"
            />
            <select
              className="border rounded px-3 py-2"
              value={calendar.guestVisibility || 'private'}
              onChange={(event) => handleSettingsChange('guestVisibility', event.target.value)}
            >
              <option value="private">Private</option>
              <option value="public_readonly">Public (read only)</option>
              <option value="friends_readonly">Friends (read only)</option>
            </select>
            <select
              className="border rounded px-3 py-2"
              value={calendar.defaultView || 'month'}
              onChange={(event) => handleSettingsChange('defaultView', event.target.value)}
            >
              <option value="month">Month</option>
              <option value="week">Week</option>
              <option value="agenda">Agenda</option>
            </select>
          </div>
          <textarea
            className="w-full border rounded px-3 py-2"
            rows={3}
            value={calendar.description || ''}
            onChange={(event) => handleSettingsChange('description', event.target.value)}
            placeholder="Calendar description"
          />
          <button type="button" onClick={saveSettings} className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700">
            Save Calendar Settings
          </button>
        </section>
      ) : null}

      {calendar && isOwner ? (
        <section className="bg-white rounded-xl shadow p-6 border border-gray-100 space-y-4">
          <h3 className="text-lg font-medium">{editingEventId ? 'Edit Event' : 'Add Event'}</h3>
          <form onSubmit={handleSubmitEvent} className="space-y-3">
            <input
              required
              className="w-full border rounded px-3 py-2"
              value={form.title}
              onChange={(event) => handleFormChange('title', event.target.value)}
              placeholder="Event title"
            />
            <textarea
              className="w-full border rounded px-3 py-2"
              rows={2}
              value={form.description}
              onChange={(event) => handleFormChange('description', event.target.value)}
              placeholder="Description"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                required
                type="datetime-local"
                className="border rounded px-3 py-2"
                value={form.startAt}
                onChange={(event) => handleFormChange('startAt', event.target.value)}
              />
              <input
                required
                type="datetime-local"
                className="border rounded px-3 py-2"
                value={form.endAt}
                onChange={(event) => handleFormChange('endAt', event.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                className="border rounded px-3 py-2"
                value={form.location}
                onChange={(event) => handleFormChange('location', event.target.value)}
                placeholder="Location"
              />
              <select
                className="border rounded px-3 py-2"
                value={form.recurrence}
                onChange={(event) => handleFormChange('recurrence', event.target.value)}
              >
                <option value="none">No repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <input
                className="border rounded px-3 py-2"
                type="number"
                min="0"
                max="10080"
                value={form.reminderMinutes}
                onChange={(event) => handleFormChange('reminderMinutes', event.target.value)}
                placeholder="Reminder (minutes)"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={(event) => handleFormChange('allDay', event.target.checked)}
              />
              All day
            </label>
            <div className="flex gap-2">
              <button type="submit" className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700">
                {editingEventId ? 'Update Event' : 'Create Event'}
              </button>
              {editingEventId ? (
                <button type="button" onClick={resetForm} className="border border-gray-300 rounded px-4 py-2 hover:bg-gray-50">
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}

      <section className="bg-white rounded-xl shadow p-6 border border-gray-100 space-y-4">
        <h3 className="text-lg font-medium">Events</h3>
        {loading || loadingEvents ? <p className="text-sm text-gray-600">Loading events…</p> : null}
        {!loading && events.length === 0 ? <p className="text-sm text-gray-600">No events in this range.</p> : null}
        <ul className="space-y-3">
          {events.map((event) => (
            <li key={event._id} className="border rounded-lg p-3">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <p className="font-medium text-gray-900">{event.title}</p>
                  <p className="text-sm text-gray-600">
                    {new Date(event.startAt).toLocaleString()} → {new Date(event.endAt).toLocaleString()}
                  </p>
                  {event.description ? <p className="text-sm text-gray-700 mt-1">{event.description}</p> : null}
                  {event.location ? <p className="text-xs text-gray-500 mt-1">📍 {event.location}</p> : null}
                </div>
                {isOwner ? (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleEdit(event)} className="text-sm text-blue-600 hover:text-blue-700">Edit</button>
                    <button type="button" onClick={() => handleDelete(event._id)} className="text-sm text-red-600 hover:text-red-700">Delete</button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default Calendar;
