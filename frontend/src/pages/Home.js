import React from 'react';

function Home() {
  return (
    <div className="bg-white rounded shadow p-8 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">SocialSecure</h1>
      <p className="text-gray-700">
        A social platform focused on secure communication, universal account discovery, referral onboarding,
        geo-aware community chat, and external-link marketplace profiles.
      </p>
      <ul className="list-disc ml-6 text-gray-700 space-y-1">
        <li>Register with your real name and choose a public username.</li>
        <li>Use client-side PGP tooling to keep private keys local-only.</li>
        <li>Post on your own feed and interact across the network.</li>
        <li>Discover city-based chat rooms with location-aware access controls.</li>
      </ul>
    </div>
  );
}

export default Home;
