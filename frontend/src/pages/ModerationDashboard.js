import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { moderationAPI } from '../utils/api';

function ModerationDashboard() {
  const [reports, setReports] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [reportsRes, appealsRes] = await Promise.all([
        moderationAPI.getReports({ page: 1, limit: 50 }),
        moderationAPI.getAppeals()
      ]);
      setReports(Array.isArray(reportsRes.data?.reports) ? reportsRes.data.reports : []);
      setAppeals(Array.isArray(appealsRes.data?.appeals) ? appealsRes.data.appeals : []);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load moderation data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const updateReportStatus = async (reportId, status) => {
    try {
      await moderationAPI.updateReport(reportId, { status });
      await loadData();
      toast.success('Report updated');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update report');
    }
  };

  const processAppeal = async (reportId, status) => {
    try {
      await moderationAPI.processAppeal(reportId, { status, decision: `Appeal ${status}` });
      await loadData();
      toast.success('Appeal processed');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to process appeal');
    }
  };

  if (loading) {
    return <div className="min-h-screen grid place-items-center">Loading moderation dashboard...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Moderation Dashboard</h1>

      <section className="bg-white rounded-lg shadow-md p-4 space-y-3">
        <h2 className="text-lg font-semibold">Reports Queue</h2>
        {reports.map((report) => (
          <div key={report._id} className="border rounded p-3 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">{report.category} • {report.targetType}</p>
              <p className="text-sm text-gray-500">Status: {report.status} • Priority: {report.priority}</p>
              <p className="text-sm text-gray-500">Reported by: {report.reporterId?.username || 'unknown'}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => updateReportStatus(report._id, 'under_review')} className="px-2 py-1 rounded bg-yellow-100 text-yellow-800 text-sm">Review</button>
              <button onClick={() => updateReportStatus(report._id, 'resolved')} className="px-2 py-1 rounded bg-green-100 text-green-800 text-sm">Resolve</button>
              <button onClick={() => updateReportStatus(report._id, 'dismissed')} className="px-2 py-1 rounded bg-gray-100 text-gray-800 text-sm">Dismiss</button>
            </div>
          </div>
        ))}
        {reports.length === 0 && <p className="text-sm text-gray-500">No reports available.</p>}
      </section>

      <section className="bg-white rounded-lg shadow-md p-4 space-y-3">
        <h2 className="text-lg font-semibold">Appeals Queue</h2>
        {appeals.map((appeal) => (
          <div key={appeal._id} className="border rounded p-3 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Appeal for report {appeal._id}</p>
              <p className="text-sm text-gray-500">By: {appeal.targetUserId?.username || appeal.reporterId?.username || 'unknown'}</p>
              <p className="text-sm text-gray-500">{appeal.appeal?.justification || ''}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => processAppeal(appeal._id, 'approved')} className="px-2 py-1 rounded bg-green-100 text-green-800 text-sm">Approve</button>
              <button onClick={() => processAppeal(appeal._id, 'rejected')} className="px-2 py-1 rounded bg-red-100 text-red-800 text-sm">Reject</button>
            </div>
          </div>
        ))}
        {appeals.length === 0 && <p className="text-sm text-gray-500">No pending appeals.</p>}
      </section>
    </div>
  );
}

export default ModerationDashboard;
