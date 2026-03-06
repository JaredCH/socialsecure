import React, { useMemo, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authAPI } from '../utils/api';

function Register({ onSuccess, onWelcomeRequired }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token'), [searchParams]);

  const [form, setForm] = useState({
    realName: '',
    username: '',
    email: '',
    password: '',
    city: '',
    state: '',
    country: '',
    referralCode: token || ''
  });
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const payload = {
        ...form,
        username: form.username.trim().toLowerCase(),
        email: form.email.trim().toLowerCase(),
        referralCode: form.referralCode || undefined
      };

      const { data } = await authAPI.register(payload);
      onSuccess(data);
      onWelcomeRequired?.(data.user || null);
      toast.success('Registration successful');
      navigate('/welcome');
    } catch (error) {
      const apiError = error.response?.data;
      const message = apiError?.error || apiError?.errors?.[0]?.msg || 'Registration failed';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto bg-white rounded shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Create your SocialSecure account</h2>
      <p className="text-sm text-gray-600 mb-4">
        Real name is required for registration. Your username is your public identity.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Real Name</label>
          <input
            name="realName"
            value={form.realName}
            onChange={handleChange}
            className="w-full border rounded p-2"
            placeholder="Jane Doe"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
          <input
            name="username"
            value={form.username}
            onChange={handleChange}
            className="w-full border rounded p-2"
            placeholder="jane_doe"
            minLength={3}
            maxLength={30}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            className="w-full border rounded p-2"
            placeholder="you@example.com"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            className="w-full border rounded p-2"
            placeholder="At least 8 chars, upper/lower/number"
            minLength={8}
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input name="city" value={form.city} onChange={handleChange} className="border rounded p-2" placeholder="City" />
          <input name="state" value={form.state} onChange={handleChange} className="border rounded p-2" placeholder="State" />
          <input name="country" value={form.country} onChange={handleChange} className="border rounded p-2" placeholder="Country" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Referral Code (optional)</label>
          <input
            name="referralCode"
            value={form.referralCode}
            onChange={handleChange}
            className="w-full border rounded p-2"
            placeholder="Referral token or code"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 text-white rounded p-2 disabled:opacity-50"
        >
          {submitting ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <p className="text-sm text-gray-600 mt-4">
        Already have an account?{' '}
        <Link className="text-blue-600" to="/login">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default Register;
