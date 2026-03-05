import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import SecurityScore from '../components/SecurityScore';
import { authAPI } from '../utils/api';

const TABS = ['overview', 'sessions', 'devices', 'events', 'settings'];

function SecurityCenter() {
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [securityData, setSecurityData] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [devices, setDevices] = useState([]);
  const [events, setEvents] = useState([]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [securityRes, sessionsRes, devicesRes, eventsRes] = await Promise.all([
        authAPI.getSecurityCenter(),
        authAPI.getSessions(),
        authAPI.getDeviceKeys(),
        authAPI.getSecurityEvents(1, 50)
      ]);

      setSecurityData(securityRes.data);
      setSessions(sessionsRes.data.sessions || []);
      setDevices(devicesRes.data.devices || []);
      setEvents(eventsRes.data.events || []);
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to load security center';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    const timer = setInterval(loadAll, 30000);
    return () => clearInterval(timer);
  }, []);

  const activeDeviceKeys = useMemo(() => devices.filter((device) => !device.isRevoked), [devices]);

  const revokeSession = async (sessionId) => {
    try {
      await authAPI.revokeSession(sessionId);
      toast.success('Session revoked');
      await loadAll();
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to revoke session';
      toast.error(message);
    }
  };

  const revokeAllOthers = async () => {
    try {
      await authAPI.revokeAllOtherSessions();
      toast.success('Other sessions revoked');
      await loadAll();
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to revoke sessions';
      toast.error(message);
    }
  };

  const revokeDevice = async (deviceId) => {
    try {
      await authAPI.revokeDeviceKey(deviceId);
      toast.success('Device key revoked');
      await loadAll();
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to revoke device key';
      toast.error(message);
    }
  };

  if (loading && !securityData) {
    return <div className="min-h-screen grid place-items-center">Loading security center...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Account Security Center</h1>
        <button onClick={loadAll} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">
          Refresh
        </button>
      </div>

      <SecurityScore score={securityData?.securityScore} breakdown={securityData?.scoreBreakdown} />

      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex flex-wrap gap-2">
          {TABS.map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded capitalize ${tab === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow-md p-4">
            <p className="text-gray-500 text-sm">Active Sessions</p>
            <p className="text-2xl font-semibold text-gray-900">{securityData?.activeSessions || 0}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4">
            <p className="text-gray-500 text-sm">Active Device Keys</p>
            <p className="text-2xl font-semibold text-gray-900">{activeDeviceKeys.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4">
            <p className="text-gray-500 text-sm">Recovery Kit Status</p>
            <p className="text-lg font-semibold text-gray-900">
              {securityData?.daysSinceBackup == null ? 'No backup yet' : `${securityData.daysSinceBackup} days ago`}
            </p>
            <Link to="/settings" className="text-sm text-blue-600 hover:text-blue-700">Generate new recovery kit</Link>
          </div>
        </div>
      )}

      {tab === 'sessions' && (
        <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
          <div className="flex justify-end">
            <button onClick={revokeAllOthers} className="px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700">
              Revoke All Other Sessions
            </button>
          </div>
          {sessions.map((session) => (
            <div key={session.id} className="border rounded p-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">
                  {session.deviceInfo?.browser || 'Unknown'} on {session.deviceInfo?.os || 'Unknown'}
                  {session.isCurrent ? ' (Current Session)' : ''}
                </p>
                <p className="text-sm text-gray-500">IP: {session.ipAddress || 'unknown'}</p>
                <p className="text-sm text-gray-500">Last activity: {new Date(session.lastActivity).toLocaleString()}</p>
              </div>
              {!session.isCurrent && (
                <button
                  onClick={() => revokeSession(session.id)}
                  className="px-3 py-2 rounded bg-red-100 text-red-700 hover:bg-red-200"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
          {sessions.length === 0 && <p className="text-gray-500">No active sessions found.</p>}
        </div>
      )}

      {tab === 'devices' && (
        <div className="bg-white rounded-lg shadow-md p-4 space-y-3">
          {devices.map((device) => (
            <div key={device.id} className="border rounded p-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{device.deviceId}</p>
                <p className="text-sm text-gray-500">Key version: {device.keyVersion}</p>
                <p className="text-sm text-gray-500">Status: {device.isRevoked ? 'Revoked' : 'Active'}</p>
              </div>
              {!device.isRevoked && (
                <button
                  onClick={() => revokeDevice(device.deviceId)}
                  className="px-3 py-2 rounded bg-red-100 text-red-700 hover:bg-red-200"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
          {devices.length === 0 && <p className="text-gray-500">No device keys registered yet.</p>}
        </div>
      )}

      {tab === 'events' && (
        <div className="bg-white rounded-lg shadow-md p-4 space-y-3">
          {events.map((event) => (
            <div key={event.id} className="border rounded p-3">
              <p className="font-medium text-gray-900">{event.eventType.replaceAll('_', ' ')}</p>
              <p className="text-sm text-gray-500">{new Date(event.createdAt).toLocaleString()}</p>
              <p className="text-xs text-gray-500">IP: {event.metadata?.ip || 'unknown'}</p>
            </div>
          ))}
          {events.length === 0 && <p className="text-gray-500">No security events yet.</p>}
        </div>
      )}

      {tab === 'settings' && (
        <div className="bg-white rounded-lg shadow-md p-4 space-y-3">
          <p className="text-gray-700">Security preferences are managed during onboarding and in User Settings.</p>
          <Link to="/settings" className="text-blue-600 hover:text-blue-700">Go to User Settings</Link>
          <div className="text-sm text-gray-500">
            <p>Login notifications: {securityData?.securityPreferences?.loginNotifications ? 'Enabled' : 'Disabled'}</p>
            <p>Session timeout: {securityData?.securityPreferences?.sessionTimeout || 60} minutes</p>
            <p>
              Require password for sensitive actions: {securityData?.securityPreferences?.requirePasswordForSensitive ? 'Yes' : 'No'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default SecurityCenter;
