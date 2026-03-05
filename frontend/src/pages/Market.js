import React, { useCallback, useEffect, useRef, useState } from 'react';
import { marketAPI } from '../utils/api';
import toast from 'react-hot-toast';

const SEARCH_DEBOUNCE_MS = 400;

const CATEGORIES = [
  'All',
  'Electronics',
  'Clothing & Apparel',
  'Furniture',
  'Vehicles',
  'Real Estate',
  'Books & Education',
  'Sports & Outdoors',
  'Toys & Games',
  'Home & Garden',
  'Art & Collectibles',
  'Jobs',
  'Services',
  'Other',
];

const LISTING_STATUSES = ['active', 'sold', 'expired'];

const isValidUrl = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

// ─── Listing Card ──────────────────────────────────────────────────────────────
const ListingCard = ({ listing, onView }) => {
  const imageUrl =
    listing.images && listing.images.length > 0 && isValidUrl(listing.images[0])
      ? listing.images[0]
      : null;

  const location = [listing.city, listing.state].filter(Boolean).join(', ');

  return (
    <button
      type="button"
      className="bg-white rounded-lg shadow hover:shadow-md transition-shadow overflow-hidden text-left w-full"
      onClick={() => onView(listing)}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={listing.title}
          className="w-full h-44 object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      ) : (
        <div className="w-full h-44 bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
          No image
        </div>
      )}
      <div className="p-3">
        <p className="font-semibold text-gray-800 truncate">{listing.title}</p>
        <p className="text-blue-600 font-bold text-lg">
          {listing.currency || 'USD'} {Number(listing.price).toLocaleString()}
        </p>
        {location && <p className="text-gray-500 text-xs mt-1">{location}</p>}
        <span className="inline-block mt-1 text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5">
          {listing.category}
        </span>
        {listing.status !== 'active' && (
          <span className="ml-2 inline-block text-xs bg-red-100 text-red-600 rounded px-2 py-0.5 capitalize">
            {listing.status}
          </span>
        )}
      </div>
    </button>
  );
};

// ─── Listing Detail Modal ──────────────────────────────────────────────────────
const ListingDetailModal = ({ listing, onClose, onMarkSold, onDelete, currentUserId }) => {
  const isOwner = listing.sellerId?._id === currentUserId || listing.sellerId === currentUserId;
  const images = (listing.images || []).filter(isValidUrl);
  const [imgIdx, setImgIdx] = useState(0);
  const location = [listing.city, listing.state, listing.country].filter(Boolean).join(', ');

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-bold text-gray-800 truncate pr-4">{listing.title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>

        {/* Images */}
        {images.length > 0 ? (
          <div className="relative">
            <img
              src={images[imgIdx]}
              alt={`${listing.title} ${imgIdx + 1}`}
              className="w-full h-72 object-cover"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            {images.length > 1 && (
              <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                {images.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setImgIdx(i)}
                    className={`w-2 h-2 rounded-full ${i === imgIdx ? 'bg-blue-600' : 'bg-white opacity-70'}`}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-48 bg-gray-100 flex items-center justify-center text-gray-400">No image</div>
        )}

        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-2xl font-bold text-blue-600">
              {listing.currency || 'USD'} {Number(listing.price).toLocaleString()}
            </span>
            <span className="text-sm bg-gray-100 text-gray-600 rounded px-2 py-0.5">{listing.category}</span>
          </div>

          <p className="text-gray-700 whitespace-pre-wrap">{listing.description}</p>

          {location && (
            <p className="text-sm text-gray-500">📍 {location}</p>
          )}

          {listing.sellerId?.username && (
            <p className="text-sm text-gray-500">
              Seller: <span className="font-medium text-gray-700">{listing.sellerId.username}</span>
            </p>
          )}

          <p className="text-xs text-gray-400">
            Listed: {new Date(listing.createdAt).toLocaleDateString()}
            {listing.views > 0 && ` · ${listing.views} views`}
          </p>

          {listing.status !== 'active' && (
            <span className="inline-block text-sm bg-red-100 text-red-600 rounded px-3 py-1 capitalize font-medium">
              {listing.status}
            </span>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            {listing.externalLink && isValidUrl(listing.externalLink) && (
              <a
                href={listing.externalLink}
                target="_blank"
                rel="noreferrer"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                View Listing →
              </a>
            )}
            {isOwner && listing.status === 'active' && (
              <button
                onClick={() => onMarkSold(listing._id)}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
              >
                Mark as Sold
              </button>
            )}
            {isOwner && (
              <button
                onClick={() => onDelete(listing._id)}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Create / Edit Form Modal ──────────────────────────────────────────────────
const EMPTY_FORM = {
  title: '',
  description: '',
  category: 'Other',
  price: '',
  currency: 'USD',
  externalLink: '',
  images: '',
  city: '',
  state: '',
  country: '',
  latitude: '',
  longitude: '',
};

const ListingFormModal = ({ initial, onClose, onSaved }) => {
  const [form, setForm] = useState(initial ? {
    ...EMPTY_FORM,
    ...initial,
    images: (initial.images || []).join(', '),
  } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const validate = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'Title is required';
    if (!form.description.trim()) errs.description = 'Description is required';
    if (!form.category.trim()) errs.category = 'Category is required';
    if (form.price === '' || isNaN(Number(form.price)) || Number(form.price) < 0)
      errs.price = 'Valid price is required';
    if (!form.externalLink.trim()) {
      errs.externalLink = 'External link is required';
    } else if (!isValidUrl(form.externalLink.trim())) {
      errs.externalLink = 'Must be a valid http/https URL';
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category.trim(),
        price: Number(form.price),
        currency: form.currency.trim().toUpperCase() || 'USD',
        externalLink: form.externalLink.trim(),
        images: form.images
          ? form.images.split(',').map((u) => u.trim()).filter(isValidUrl)
          : [],
      };
      if (form.city.trim()) payload.city = form.city.trim();
      if (form.state.trim()) payload.state = form.state.trim();
      if (form.country.trim()) payload.country = form.country.trim();
      const lat = parseFloat(form.latitude);
      const lon = parseFloat(form.longitude);
      if (!isNaN(lat) && !isNaN(lon)) {
        payload.latitude = lat;
        payload.longitude = lon;
      }

      if (initial?._id) {
        await marketAPI.updateListing(initial._id, payload);
        toast.success('Listing updated!');
      } else {
        await marketAPI.createListing(payload);
        toast.success('Listing created!');
      }
      onSaved();
    } catch (err) {
      const msg = err.response?.data?.errors?.[0]?.msg
        || err.response?.data?.error
        || 'Failed to save listing';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const field = (name, label, type = 'text', opts = {}) => (
    <div key={name}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}{opts.required && ' *'}</label>
      {type === 'textarea' ? (
        <textarea
          className={`w-full border rounded-lg p-2 text-sm ${errors[name] ? 'border-red-400' : 'border-gray-300'}`}
          rows={4}
          value={form[name]}
          onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))}
          {...opts}
        />
      ) : (
        <input
          type={type}
          className={`w-full border rounded-lg p-2 text-sm ${errors[name] ? 'border-red-400' : 'border-gray-300'}`}
          value={form[name]}
          onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))}
          {...opts}
        />
      )}
      {errors[name] && <p className="text-red-500 text-xs mt-1">{errors[name]}</p>}
    </div>
  );

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">
            {initial?._id ? 'Edit Listing' : 'Create Listing'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {field('title', 'Title', 'text', { required: true, maxLength: 200, placeholder: 'e.g. iPhone 14 Pro' })}
          {field('description', 'Description', 'textarea', { required: true, placeholder: 'Describe the item...' })}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
            <select
              className="w-full border border-gray-300 rounded-lg p-2 text-sm"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {field('price', 'Price *', 'number', { min: 0, step: 0.01, placeholder: '0.00' })}
            {field('currency', 'Currency', 'text', { maxLength: 3, placeholder: 'USD' })}
          </div>

          {field('externalLink', 'External Link *', 'url', { placeholder: 'https://...' })}
          {field('images', 'Image URLs (comma-separated)', 'text', { placeholder: 'https://... , https://...' })}

          <div className="border-t pt-3">
            <p className="text-xs text-gray-500 mb-2 font-medium">Location (optional)</p>
            <div className="grid grid-cols-3 gap-2">
              {field('city', 'City')}
              {field('state', 'State')}
              {field('country', 'Country')}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {field('latitude', 'Latitude', 'number', { step: 'any', placeholder: '37.77' })}
              {field('longitude', 'Longitude', 'number', { step: 'any', placeholder: '-122.41' })}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : initial?._id ? 'Update Listing' : 'Post Listing'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Main Market Page ──────────────────────────────────────────────────────────
const Market = () => {
  const [tab, setTab] = useState('browse'); // 'browse' | 'mine'
  const [listings, setListings] = useState([]);
  const [myListings, setMyListings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [myPagination, setMyPagination] = useState({ page: 1, pages: 1, total: 0 });

  // Filters
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [myStatusFilter, setMyStatusFilter] = useState('');

  // Modals
  const [detailListing, setDetailListing] = useState(null);
  const [editListing, setEditListing] = useState(null); // null = closed, {} = new, listing = edit

  const currentUserId = (() => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.userId || null;
    } catch {
      return null;
    }
  })();

  const fetchListings = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const filters = {};
      if (category && category !== 'All') filters.category = category;
      if (minPrice) filters.minPrice = parseFloat(minPrice);
      if (maxPrice) filters.maxPrice = parseFloat(maxPrice);

      const { data } = await marketAPI.getListings(filters, page, 20);
      let items = data.listings || [];

      // Client-side keyword search (server doesn't support full-text yet)
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        items = items.filter(
          (l) =>
            l.title.toLowerCase().includes(q) ||
            l.description.toLowerCase().includes(q) ||
            l.category.toLowerCase().includes(q)
        );
      }

      setListings(items);
      // Recalculate pagination when client-side search filters the results
      const serverPagination = data.pagination || { page, pages: 1, total: 0, limit: 20 };
      if (search.trim()) {
        const filteredTotal = items.length;
        setPagination({ ...serverPagination, total: filteredTotal, pages: Math.max(1, Math.ceil(filteredTotal / serverPagination.limit)) });
      } else {
        setPagination(serverPagination);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load listings');
    } finally {
      setLoading(false);
    }
  }, [category, minPrice, maxPrice, search]);

  const fetchMyListings = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const { data } = await marketAPI.getUserListings(page, 20, myStatusFilter || undefined);
      setMyListings(data.listings || []);
      setMyPagination(data.pagination || { page, pages: 1, total: 0 });
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'ONBOARDING_REQUIRED') {
        toast.error('Complete onboarding to manage listings');
      } else {
        toast.error(err.response?.data?.error || 'Failed to load your listings');
      }
    } finally {
      setLoading(false);
    }
  }, [myStatusFilter]);

  // Debounce ref for search
  const searchTimer = useRef(null);
  const handleSearchChange = (value) => {
    setSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      if (tab === 'browse') fetchListings(1);
    }, SEARCH_DEBOUNCE_MS);
  };

  useEffect(() => {
    if (tab === 'browse') fetchListings(1);
  }, [tab, category, minPrice, maxPrice, fetchListings]);

  useEffect(() => {
    if (tab === 'mine') fetchMyListings(1);
  }, [tab, myStatusFilter, fetchMyListings]);

  const handleMarkSold = async (listingId) => {
    try {
      await marketAPI.markAsSold(listingId);
      toast.success('Marked as sold');
      setDetailListing(null);
      if (tab === 'browse') fetchListings(pagination.page);
      else fetchMyListings(myPagination.page);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to mark as sold');
    }
  };

  const handleDelete = async (listingId) => {
    if (!window.confirm('Delete this listing?')) return;
    try {
      await marketAPI.deleteListing(listingId);
      toast.success('Listing deleted');
      setDetailListing(null);
      if (tab === 'browse') fetchListings(pagination.page);
      else fetchMyListings(myPagination.page);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete listing');
    }
  };

  const handleView = async (listing) => {
    setDetailListing(listing);
    // Fire-and-forget view count increment; errors are intentionally ignored
    marketAPI.incrementViews(listing._id).catch(() => {});
  };

  const activeListing = tab === 'browse' ? listings : myListings;
  const activePagination = tab === 'browse' ? pagination : myPagination;
  const activeFetch = tab === 'browse' ? fetchListings : fetchMyListings;

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Marketplace</h1>
        <button
          onClick={() => setEditListing({})}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Post Listing
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white shadow rounded-lg mb-4">
        <div className="flex border-b">
          {['browse', 'mine'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-6 py-3 text-sm font-medium capitalize ${
                tab === t
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-blue-600'
              }`}
            >
              {t === 'browse' ? 'Browse Listings' : 'My Listings'}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4 mb-4">
        {tab === 'browse' ? (
          <div className="flex flex-wrap gap-3">
            {/* Search */}
            <input
              type="text"
              placeholder="Search listings…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[160px]"
            />
            {/* Category */}
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {/* Price */}
            <input
              type="number"
              min={0}
              placeholder="Min $"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24"
            />
            <input
              type="number"
              min={0}
              placeholder="Max $"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24"
            />
            <button
              onClick={() => { setSearch(''); setCategory('All'); setMinPrice(''); setMaxPrice(''); }}
              className="border border-gray-300 text-gray-600 rounded-lg px-3 py-2 text-sm hover:bg-gray-50"
            >
              Reset
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 items-center">
            <span className="text-sm font-medium text-gray-600">Filter by status:</span>
            {['', ...LISTING_STATUSES].map((s) => (
              <button
                key={s}
                onClick={() => setMyStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-sm capitalize border ${
                  myStatusFilter === s
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {s || 'All'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Category pills for browse */}
      {tab === 'browse' && (
        <div className="flex gap-2 flex-wrap mb-4">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1 rounded-full text-sm border ${
                category === c
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Listings Grid */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading…</div>
      ) : activeListing.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          {tab === 'browse'
            ? 'No listings found. Try adjusting your filters.'
            : 'You have no listings yet. Click "+ Post Listing" to create one.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {activeListing.map((listing) => (
            <ListingCard key={listing._id} listing={listing} onView={handleView} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {activePagination.pages > 1 && !loading && (
        <div className="flex justify-center items-center gap-2 mt-6">
          <button
            disabled={activePagination.page <= 1}
            onClick={() => activeFetch(activePagination.page - 1)}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-600">
            Page {activePagination.page} of {activePagination.pages} ({activePagination.total} listings)
          </span>
          <button
            disabled={activePagination.page >= activePagination.pages}
            onClick={() => activeFetch(activePagination.page + 1)}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            Next →
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {detailListing && (
        <ListingDetailModal
          listing={detailListing}
          onClose={() => setDetailListing(null)}
          onMarkSold={handleMarkSold}
          onDelete={handleDelete}
          currentUserId={currentUserId}
        />
      )}

      {/* Create / Edit Modal */}
      {editListing !== null && (
        <ListingFormModal
          initial={Object.keys(editListing).length > 0 ? editListing : null}
          onClose={() => setEditListing(null)}
          onSaved={() => {
            setEditListing(null);
            if (tab === 'browse') fetchListings(1);
            else fetchMyListings(1);
          }}
        />
      )}
    </div>
  );
};

export default Market;
