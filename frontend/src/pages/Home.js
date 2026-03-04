import React from 'react';
import { Link } from 'react-router-dom';

function Home() {
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 text-white shadow-xl">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_#60a5fa_0%,_transparent_45%),radial-gradient(circle_at_bottom_left,_#818cf8_0%,_transparent_50%)]" />
        <div className="relative p-10 md:p-14 lg:p-16">
          <span className="inline-flex items-center rounded-full bg-white/10 px-4 py-1 text-xs tracking-wider uppercase">
            Private by default • Built for real communities
          </span>
          <h1 className="mt-4 text-4xl md:text-5xl font-bold leading-tight max-w-3xl">
            Social networking that feels modern, secure, and worth your time.
          </h1>
          <p className="mt-4 text-blue-100 text-lg max-w-2xl">
            SocialSecure helps you share, connect, and discover people nearby with a clean experience and strong privacy foundations.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register" className="bg-white text-slate-900 px-5 py-3 rounded-lg font-semibold hover:bg-blue-50">
              Create Account
            </Link>
            <Link to="/login" className="border border-white/30 px-5 py-3 rounded-lg font-semibold hover:bg-white/10">
              Sign In
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <article className="bg-white rounded-2xl shadow p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Social timeline</h2>
          <p className="mt-2 text-sm text-gray-600">Share updates with media, comments, and reactions in a polished social feed.</p>
        </article>
        <article className="bg-white rounded-2xl shadow p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Location-aware chat</h2>
          <p className="mt-2 text-sm text-gray-600">Join city-based conversations and connect to people in your community context.</p>
        </article>
        <article className="bg-white rounded-2xl shadow p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">User-controlled keys</h2>
          <p className="mt-2 text-sm text-gray-600">Publish your PGP public key from settings to receive encrypted messages securely.</p>
        </article>
      </section>
    </div>
  );
}

export default Home;
