import React, { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authAPI, calendarAPI } from '../utils/api';

const VIEW_OPTIONS = ['month', 'week', 'agenda'];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const emptyForm = {
  title: '',
  description: '',
  startAt: '',
  endAt: '',
  allDay: false,
  location: '',
  color: '',
  recurrence: 'none',
  reminderMinutes: '',
  inviteesText: '',
  announceTarget: 'none',
  relationshipAudience: 'social'
};

const toDateTimeInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().slice(0, 16);
};

const formatRangeLabel = (viewMode, anchorDate) => {
  const date = new Date(anchorDate);
  if (viewMode === 'month') {
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  if (viewMode === 'week') {
    const start = getWeekStart(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

const getWeekStart = (date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
};

const buildMonthGrid = (anchorDate) => {
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const gridStart = getWeekStart(monthStart);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
};

const isSameDay = (left, right) => (
  left.getFullYear() === right.getFullYear()
  && left.getMonth() === right.getMonth()
  && left.getDate() === right.getDate()
);

const eventOverlapsDay = (event, day) => {
  const startAt = new Date(event.startAt);
  const endAt = new Date(event.endAt);
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return startAt < dayEnd && endAt >= dayStart;
};

const splitInvitees = (value) => String(value || '')
  .split(/[\n,]+/)
  .map((item) => item.trim())
  .filter(Boolean)
  .slice(0, 20);

const eventTimeLabel = (event) => {
  if (event.allDay) return 'All day';
  const start = new Date(event.startAt);
  return start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [modalMode, setModalMode] = useState('view');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [anchorDate, setAnchorDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [viewMode, setViewMode] = useState('month');

  const dateRange = useMemo(() => {
    const start = new Date(anchorDate);
    const end = new Date(anchorDate);
    start.setDate(start.getDate() - 60);
    end.setDate(end.getDate() + 180);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [anchorDate]);

  const closeModal = () => {
    setIsModalOpen(false);
    setModalMode('view');
    setSelectedEvent(null);
    setEditingEventId(null);
    setForm(emptyForm);
  };

  const openCreateModal = (seedDate = null) => {
    const start = seedDate ? new Date(seedDate) : new Date();
    if (!seedDate) {
      start.setMinutes(0, 0, 0);
      start.setHours(start.getHours() + 1);
    }
    const end = new Date(start);
    end.setHours(end.getHours() + 1);

    setForm({
      ...emptyForm,
      startAt: toDateTimeInput(start.toISOString()),
      endAt: toDateTimeInput(end.toISOString())
    });
    setEditingEventId(null);
    setSelectedEvent(null);
    setModalMode('create');
    setIsModalOpen(true);
  };

  const openEventModal = (event) => {
    setSelectedEvent(event);
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
      reminderMinutes: Number.isInteger(event.reminderMinutes) ? String(event.reminderMinutes) : '',
      inviteesText: Array.isArray(event.invitees) ? event.invitees.join(', ') : '',
      announceTarget: ['feed', 'post'].includes(event.announceTarget) ? event.announceTarget : 'none',
      relationshipAudience: event.relationshipAudience === 'secure' ? 'secure' : 'social'
    });
    setModalMode('view');
    setIsModalOpen(true);
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
        setViewMode(VIEW_OPTIONS.includes(calendarData?.calendar?.defaultView) ? calendarData.calendar.defaultView : 'month');
      } else {
        const [{ data: calendarData }, { data: eventsData }] = await Promise.all([
          calendarAPI.getUserCalendar(requestedUser),
          calendarAPI.getUserCalendarEvents(requestedUser, dateRange)
        ]);
        setCalendar(calendarData.calendar);
        setEvents(eventsData.events || []);
        setOwner(calendarData.owner || null);
        setIsOwner(Boolean(calendarData.isOwner));
        setViewMode(VIEW_OPTIONS.includes(calendarData?.calendar?.defaultView) ? calendarData.calendar.defaultView : 'month');
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

  const handleSubmitEvent = async (event) => {
    event.preventDefault();
    if (!isOwner) return;

    const payload = {
      ...form,
      reminderMinutes: form.reminderMinutes === '' ? null : Number(form.reminderMinutes),
      invitees: splitInvitees(form.inviteesText)
    };

    try {
      if (editingEventId) {
        await calendarAPI.updateEvent(editingEventId, payload);
        toast.success('Event updated');
      } else {
        await calendarAPI.createEvent(payload);
        toast.success('Event created');
      }
      closeModal();
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
      closeModal();
      await loadCalendar();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete event');
    }
  };

  const navigatePeriod = (direction) => {
    setAnchorDate((current) => {
      const next = new Date(current);
      if (viewMode === 'month' || viewMode === 'agenda') {
        next.setMonth(next.getMonth() + direction);
      } else {
        next.setDate(next.getDate() + (7 * direction));
      }
      return next;
    });
  };

  const handleDayClick = (day, dayEvents) => {
    if (dayEvents[0]) {
      openEventModal(dayEvents[0]);
      return;
    }
    if (isOwner) {
      openCreateModal(day);
    }
  };

  const monthDays = useMemo(() => buildMonthGrid(anchorDate), [anchorDate]);
  const weekDays = useMemo(() => {
    const weekStart = getWeekStart(anchorDate);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + index);
      return day;
    });
  }, [anchorDate]);

  const sortedEvents = useMemo(() => (
    [...events].sort((left, right) => new Date(left.startAt) - new Date(right.startAt))
  ), [events]);

  const agendaEvents = useMemo(() => {
    const start = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const end = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return sortedEvents.filter((event) => {
      const startAt = new Date(event.startAt);
      return startAt >= start && startAt <= end;
    });
  }, [anchorDate, sortedEvents]);

  return (
    <div data-testid="calendar-page-shell" className="h-full min-h-0 flex flex-col">
      <div data-testid="calendar-page-grid" className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4 lg:gap-6">
        <aside data-testid="calendar-sidebar" className="bg-white rounded-xl shadow border border-gray-100 p-4 space-y-4 min-h-0 overflow-y-auto">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Calendar</h2>
            <p className="text-sm text-gray-600 mt-1">
              {owner?.username ? `Viewing @${owner.username}'s calendar` : 'Personal calendar'}
            </p>
          </div>

          {!requestedUser ? null : (
            <Link to="/calendar" className="inline-flex text-sm text-blue-600 hover:text-blue-700">Back to My Calendar</Link>
          )}

          {isOwner ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => openCreateModal()}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-white font-medium hover:bg-blue-700"
              >
                + Create Event
              </button>
              <button
                type="button"
                onClick={() => setAnchorDate(new Date())}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                Today
              </button>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{errorMessage}</div>
          ) : null}

          {calendar && !loading ? (
            <div className="rounded-lg border border-gray-200 p-3 text-sm text-gray-700 space-y-1">
              <p><span className="font-medium">Title:</span> {calendar.title}</p>
              <p><span className="font-medium">Timezone:</span> {calendar.timezone}</p>
              <p><span className="font-medium">Visibility:</span> {calendar.guestVisibility}</p>
              {calendar.description ? <p><span className="font-medium">Description:</span> {calendar.description}</p> : null}
            </div>
          ) : null}

          {calendar && isOwner ? (
            <div className="space-y-2 border-t border-gray-100 pt-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Calendar settings</p>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={calendar.title || ''}
                onChange={(event) => handleSettingsChange('title', event.target.value)}
                placeholder="Calendar title"
              />
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={calendar.defaultView || 'month'}
                onChange={(event) => handleSettingsChange('defaultView', event.target.value)}
              >
                <option value="month">Month default</option>
                <option value="week">Week default</option>
                <option value="agenda">Agenda default</option>
              </select>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={calendar.guestVisibility || 'private'}
                onChange={(event) => handleSettingsChange('guestVisibility', event.target.value)}
              >
                <option value="private">Private</option>
                <option value="public_readonly">Public (read only)</option>
                <option value="friends_readonly">Friends (read only)</option>
              </select>
              <button type="button" onClick={saveSettings} className="w-full rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
                Save settings
              </button>
            </div>
          ) : null}
        </aside>

        <section data-testid="calendar-main-panel" className="bg-white rounded-xl shadow border border-gray-100 p-4 md:p-6 space-y-4 flex min-h-0 flex-col overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => navigatePeriod(-1)} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">←</button>
              <button type="button" onClick={() => navigatePeriod(1)} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">→</button>
              <button type="button" onClick={() => setAnchorDate(new Date())} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">Today</button>
              <h3 className="text-lg font-semibold text-gray-900 ml-1">{formatRangeLabel(viewMode, anchorDate)}</h3>
            </div>
            <div className="inline-flex rounded-lg border border-gray-300 p-1 self-start">
              {VIEW_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setViewMode(option)}
                  className={`px-3 py-1.5 text-sm rounded-md capitalize ${viewMode === option ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {loading || loadingEvents ? <p className="text-sm text-gray-600">Loading events…</p> : null}

          {!loading && viewMode === 'month' ? (
            <div data-testid="calendar-month-grid" className="border border-gray-200 rounded-xl overflow-hidden flex min-h-0 flex-1 flex-col">
              <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 auto-rows-fr flex-1 min-h-0">
                {monthDays.map((day) => {
                  const dayEvents = sortedEvents.filter((event) => eventOverlapsDay(event, day));
                  const inActiveMonth = day.getMonth() === anchorDate.getMonth();
                  const isToday = isSameDay(day, new Date());
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => handleDayClick(day, dayEvents)}
                      className={`min-h-[72px] border-b border-r border-gray-100 p-2 text-left align-top ${inActiveMonth ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50`}
                    >
                      <p className={`text-xs font-semibold ${isToday ? 'text-blue-700' : 'text-gray-500'}`}>{day.getDate()}</p>
                      <div className="mt-1 space-y-1">
                        {dayEvents.slice(0, 3).map((event) => (
                          <div key={event._id} className={`truncate rounded px-2 py-0.5 text-xs ${event.relationshipAudience === 'secure' ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'}`}>
                            {eventTimeLabel(event)} · {event.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 ? <p className="text-xs text-gray-500">+{dayEvents.length - 3} more</p> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!loading && viewMode === 'week' ? (
            <div className="grid grid-cols-1 md:grid-cols-7 gap-3 flex-1 min-h-0 overflow-y-auto">
              {weekDays.map((day) => {
                const dayEvents = sortedEvents.filter((event) => eventOverlapsDay(event, day));
                return (
                  <div key={day.toISOString()} className="border border-gray-200 rounded-lg p-2 min-h-[140px]">
                    <p className="text-xs uppercase tracking-wide text-gray-500">{day.toLocaleDateString(undefined, { weekday: 'short' })}</p>
                    <p className="text-sm font-semibold text-gray-900">{day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                    <div className="mt-2 space-y-2">
                      {dayEvents.map((event) => (
                        <button
                          key={event._id}
                          type="button"
                          onClick={() => openEventModal(event)}
                          className={`w-full rounded border px-2 py-1 text-left ${selectedEvent?._id === event._id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                        >
                          <p className="text-xs text-gray-500">{eventTimeLabel(event)}</p>
                          <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
                        </button>
                      ))}
                      {dayEvents.length === 0 ? <p className="text-xs text-gray-400">No events</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {!loading && viewMode === 'agenda' ? (
            <div className="space-y-3 flex-1 min-h-0 overflow-y-auto">
              {agendaEvents.length === 0 ? <p className="text-sm text-gray-600">No events in this month.</p> : null}
              {agendaEvents.map((event) => (
                <button
                  key={event._id}
                  type="button"
                  onClick={() => openEventModal(event)}
                  className={`w-full border rounded-lg p-3 text-left hover:bg-gray-50 ${selectedEvent?._id === event._id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{event.title}</p>
                      <p className="text-sm text-gray-600">{new Date(event.startAt).toLocaleString()} → {new Date(event.endAt).toLocaleString()}</p>
                      {event.location ? <p className="text-xs text-gray-500 mt-1">📍 {event.location}</p> : null}
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs uppercase tracking-wide ${event.relationshipAudience === 'secure' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}`}>
                      {event.relationshipAudience === 'secure' ? 'Secure' : 'Social'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40 px-4 py-8 overflow-y-auto">
          <div className="mx-auto max-w-2xl rounded-xl bg-white shadow-xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-xl font-semibold text-gray-900">
                  {modalMode === 'create' ? 'Create Event' : modalMode === 'edit' ? 'Edit Event' : 'Event Details'}
                </h4>
                <p className="text-sm text-gray-500">Select users to invite, announce, and set Social/Secure audience.</p>
              </div>
              <button type="button" onClick={closeModal} className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50">Close</button>
            </div>

            {modalMode === 'view' && selectedEvent ? (
              <div className="space-y-2 text-sm text-gray-700">
                <p className="text-lg font-medium text-gray-900">{selectedEvent.title}</p>
                <p>{new Date(selectedEvent.startAt).toLocaleString()} → {new Date(selectedEvent.endAt).toLocaleString()}</p>
                {selectedEvent.description ? <p>{selectedEvent.description}</p> : null}
                {selectedEvent.location ? <p>📍 {selectedEvent.location}</p> : null}
                <p>Audience: <span className="font-medium capitalize">{selectedEvent.relationshipAudience || 'social'}</span></p>
                <p>Announce: <span className="font-medium capitalize">{selectedEvent.announceTarget || 'none'}</span></p>
                <p>Invited: {Array.isArray(selectedEvent.invitees) && selectedEvent.invitees.length ? selectedEvent.invitees.join(', ') : 'No invitees yet'}</p>
                {isOwner ? (
                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={() => setModalMode('edit')} className="rounded bg-blue-600 px-4 py-2 text-white text-sm hover:bg-blue-700">Modify Event</button>
                    <button type="button" onClick={() => handleDelete(selectedEvent._id)} className="rounded border border-red-300 px-4 py-2 text-red-700 text-sm hover:bg-red-50">Delete Event</button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {(modalMode === 'create' || modalMode === 'edit') ? (
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select
                    className="border rounded px-3 py-2"
                    value={form.relationshipAudience}
                    onChange={(event) => handleFormChange('relationshipAudience', event.target.value)}
                  >
                    <option value="social">Social (broader circles)</option>
                    <option value="secure">Secure (trusted circles only)</option>
                  </select>
                  <select
                    className="border rounded px-3 py-2"
                    value={form.announceTarget}
                    onChange={(event) => handleFormChange('announceTarget', event.target.value)}
                  >
                    <option value="none">Do not announce</option>
                    <option value="feed">Announce on feed</option>
                    <option value="post">Announce as post</option>
                  </select>
                  <select
                    className="border rounded px-3 py-2"
                    value={form.color}
                    onChange={(event) => handleFormChange('color', event.target.value)}
                  >
                    <option value="">Default color</option>
                    <option value="blue">Blue</option>
                    <option value="green">Green</option>
                    <option value="red">Red</option>
                    <option value="purple">Purple</option>
                    <option value="orange">Orange</option>
                    <option value="gray">Gray</option>
                  </select>
                </div>
                <textarea
                  className="w-full border rounded px-3 py-2"
                  rows={2}
                  value={form.inviteesText}
                  onChange={(event) => handleFormChange('inviteesText', event.target.value)}
                  placeholder="Invite user or users (comma or newline separated usernames/emails)"
                />
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.allDay}
                    onChange={(event) => handleFormChange('allDay', event.target.checked)}
                  />
                  All day event
                </label>
                <div className="flex gap-2">
                  <button type="submit" className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700">
                    {editingEventId ? 'Save Changes' : 'Add Event'}
                  </button>
                  <button type="button" onClick={closeModal} className="border border-gray-300 rounded px-4 py-2 hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Calendar;
