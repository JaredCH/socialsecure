import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { marketAPI, authAPI } from '../utils/api';
import toast from 'react-hot-toast';

// --- Constants ---

const CATEGORIES = [
  {
    id: 'for-sale', name: 'For Sale', icon: '\u{1F6CD}\uFE0F',
    subcategories: [
      { id: 'electronics', name: 'Electronics', icon: '\u{1F4F1}' },
      { id: 'furniture', name: 'Furniture', icon: '\u{1FA91}' },
      { id: 'clothing', name: 'Clothing & Accessories', icon: '\u{1F455}' },
      { id: 'vehicles', name: 'Vehicles', icon: '\u{1F697}' },
      { id: 'tools', name: 'Tools & Hardware', icon: '\u{1F527}' },
      { id: 'books', name: 'Books & Media', icon: '\u{1F4DA}' },
      { id: 'sports', name: 'Sports & Outdoors', icon: '\u26BD' },
      { id: 'home-garden', name: 'Home & Garden', icon: '\u{1F331}' },
      { id: 'collectibles', name: 'Collectibles & Antiques', icon: '\u{1F3C6}' },
      { id: 'toys', name: 'Toys & Games', icon: '\u{1F9F8}' },
      { id: 'health-beauty', name: 'Health & Beauty', icon: '\u{1F484}' },
      { id: 'other-sale', name: 'Other', icon: '\u{1F4E6}' },
    ],
  },
  {
    id: 'services', name: 'Services', icon: '\u{1F6E0}\uFE0F',
    subcategories: [
      { id: 'professional', name: 'Professional Services', icon: '\u{1F4BC}' },
      { id: 'labor', name: 'Labor & Moving', icon: '\u{1F3D7}\uFE0F' },
      { id: 'creative', name: 'Creative Services', icon: '\u{1F3A8}' },
      { id: 'tutoring', name: 'Tutoring & Lessons', icon: '\u{1F4D6}' },
      { id: 'tech-support', name: 'Tech Support', icon: '\u{1F4BB}' },
      { id: 'other-services', name: 'Other Services', icon: '\u{1F528}' },
    ],
  },
  {
    id: 'housing', name: 'Housing', icon: '\u{1F3E0}',
    subcategories: [
      { id: 'apartments', name: 'Apartments & Condos', icon: '\u{1F3E2}' },
      { id: 'houses', name: 'Houses', icon: '\u{1F3E1}' },
      { id: 'rooms', name: 'Rooms for Rent', icon: '\u{1F6AA}' },
      { id: 'shared', name: 'Shared Housing', icon: '\u{1F465}' },
      { id: 'commercial', name: 'Commercial & Office', icon: '\u{1F3EC}' },
    ],
  },
  {
    id: 'jobs', name: 'Jobs', icon: '\u{1F4BC}',
    subcategories: [
      { id: 'full-time', name: 'Full-Time', icon: '\u{1F4CB}' },
      { id: 'part-time', name: 'Part-Time', icon: '\u{1F550}' },
      { id: 'contract', name: 'Contract & Freelance', icon: '\u{1F4DD}' },
      { id: 'gigs', name: 'Gigs & Temp', icon: '\u26A1' },
      { id: 'internships', name: 'Internships', icon: '\u{1F393}' },
    ],
  },
  {
    id: 'community', name: 'Community', icon: '\u{1F91D}',
    subcategories: [
      { id: 'events', name: 'Events & Activities', icon: '\u{1F389}' },
      { id: 'classes', name: 'Classes & Workshops', icon: '\u{1F3EB}' },
      { id: 'volunteer', name: 'Volunteer', icon: '\u2764\uFE0F' },
      { id: 'lost-found', name: 'Lost & Found', icon: '\u{1F50D}' },
      { id: 'free-stuff', name: 'Free Stuff', icon: '\u{1F381}' },
    ],
  },
];

const ALL_CATEGORY_MAP = CATEGORIES.reduce((acc, cat) => {
  acc[cat.id] = cat.name;
  cat.subcategories.forEach(sub => { acc[sub.id] = sub.name; });
  return acc;
}, {});

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY'];
const MAX_LISTING_IMAGES = 6;
const CONDITION_OPTIONS = [
  { value: '', label: 'Select condition' },
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
  { value: 'not_applicable', label: 'Not Applicable' },
];
const CATEGORY_DETAIL_FIELDS = {
  'for-sale': [
    { key: 'itemType', label: 'Item Type', placeholder: 'e.g., Laptop, Sofa, Bicycle' },
    { key: 'pickupDetails', label: 'Pickup / Delivery Details', placeholder: 'Pickup location, delivery options, timing' },
  ],
  services: [
    { key: 'serviceType', label: 'Service Type', placeholder: 'e.g., Plumbing, Graphic Design' },
    { key: 'availability', label: 'Availability', placeholder: 'Days/hours available' },
  ],
  housing: [
    { key: 'propertyType', label: 'Property Type', placeholder: 'e.g., Apartment, Room, Office' },
    { key: 'availability', label: 'Availability', placeholder: 'Move-in date or lease window' },
  ],
  jobs: [
    { key: 'jobType', label: 'Job Type', placeholder: 'e.g., Full-time, Part-time, Contract' },
    { key: 'compensation', label: 'Compensation', placeholder: 'Hourly rate, salary range, stipend' },
  ],
  community: [
    { key: 'activityType', label: 'Activity Type', placeholder: 'e.g., Event, Volunteer, Class' },
    { key: 'schedule', label: 'Schedule', placeholder: 'Date/time and recurring details' },
  ],
};

const STATUS_LABELS = { active: 'Active', sold: 'Sold', expired: 'Expired', pending: 'Pending' };
const STATUS_COLORS = {
  active: 'bg-green-100 text-green-800',
  sold: 'bg-gray-100 text-gray-600',
  expired: 'bg-red-100 text-red-800',
  pending: 'bg-yellow-100 text-yellow-800',
};

// --- Helpers ---

const formatPrice = (price, currency = 'USD') => {
  if (price === 0) return 'Free';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(price);
  } catch {
    return currency + ' ' + price;
  }
};

const formatRelativeTime = (dateStr) => {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 30) return days + 'd ago';
  return new Date(dateStr).toLocaleDateString();
};

const getCategoryLabel = (id) => ALL_CATEGORY_MAP[id] || id || '';

const getCategoryIcon = (id) => {
  for (const cat of CATEGORIES) {
    if (cat.id === id) return cat.icon;
    for (const sub of cat.subcategories) {
      if (sub.id === id) return sub.icon;
    }
  }
  return '\u{1F4E6}';
};

const getParentCategoryId = (categoryId) => {
  if (!categoryId) return '';
  const parentCategory = CATEGORIES.find(cat => cat.id === categoryId || cat.subcategories.some(sub => sub.id === categoryId));
  return parentCategory ? parentCategory.id : '';
};

const getRequiredCategoryDetails = (categoryId) => {
  const parent = getParentCategoryId(categoryId);
  return CATEGORY_DETAIL_FIELDS[parent] || [];
};

const normalizeAdditionalDetails = (details) => {
  if (!details || typeof details !== 'object') return {};
  return Object.entries(details).reduce((acc, [key, value]) => {
    const normalized = typeof value === 'string' ? value : String(value || '');
    acc[key] = normalized;
    return acc;
  }, {});
};

const emptyListingForm = {
  title: '',
  description: '',
  category: '',
  condition: '',
  price: '',
  currency: 'USD',
  externalLink: '',
  additionalDetails: {},
  images: [],
  imageFiles: [],
  city: '',
  state: '',
  country: '',
  latitude: '',
  longitude: '',
};

// --- Category Sidebar ---

function CategorySidebar({ selected, onSelect, expandedCats, onToggle }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-semibold text-gray-800 mb-3">Categories</h3>
      <button
        onClick={() => onSelect('')}
        className={'w-full text-left px-3 py-2 rounded text-sm mb-1 ' + (!selected ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-100 text-gray-700')}
      >
        All Listings
      </button>
      {CATEGORIES.map(cat => (
        <div key={cat.id}>
          <div className="flex items-center">
            <button
              onClick={() => onSelect(cat.id)}
              className={'flex-1 text-left px-3 py-2 rounded text-sm ' + (selected === cat.id ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-100 text-gray-700')}
            >
              <span className="mr-2">{cat.icon}</span>{cat.name}
            </button>
            <button
              onClick={() => onToggle(cat.id)}
              className="px-2 py-2 text-gray-400 hover:text-gray-600 text-xs"
              aria-label="Toggle subcategories"
            >
              {expandedCats.includes(cat.id) ? '\u25B2' : '\u25BC'}
            </button>
          </div>
          {expandedCats.includes(cat.id) && (
            <div className="ml-4 border-l-2 border-gray-200 pl-2">
              {cat.subcategories.map(sub => (
                <button
                  key={sub.id}
                  onClick={() => onSelect(sub.id)}
                  className={'w-full text-left px-2 py-1.5 rounded text-xs block ' + (selected === sub.id ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-100 text-gray-600')}
                >
                  <span className="mr-1">{sub.icon}</span>{sub.name}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Listing Card ---

function ListingCard({ listing, currentUserId, onView, onEdit, onDelete, onMarkSold, onInitiateSale, onReactivate }) {
  const isOwner = currentUserId && String(listing.sellerId && (listing.sellerId._id || listing.sellerId)) === String(currentUserId);
  const imageUrl = listing.images && listing.images[0];
  const catIcon = getCategoryIcon(listing.category);

  return (
    <div
      className="bg-white rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer border border-gray-200 overflow-hidden"
      onClick={() => onView(listing)}
    >
      <div className="h-48 bg-gray-100 flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={listing.title}
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <span className="text-4xl">{catIcon}</span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2 flex-1">{listing.title}</h3>
          <span className={'text-xs px-2 py-0.5 rounded-full flex-shrink-0 ' + (STATUS_COLORS[listing.status] || '')}>
            {STATUS_LABELS[listing.status] || listing.status}
          </span>
        </div>
        <p className="text-blue-600 font-bold mt-1">{formatPrice(listing.price, listing.currency)}</p>
        <p className="text-xs text-gray-500 mt-1">{getCategoryLabel(listing.category)}</p>
        {(listing.city || listing.state) && (
          <p className="text-xs text-gray-500">{'\u{1F4CD}'} {[listing.city, listing.state].filter(Boolean).join(', ')}</p>
        )}
        <p className="text-xs text-gray-400 mt-1">{formatRelativeTime(listing.createdAt)}</p>

        {isOwner && (
          <div className="flex flex-wrap gap-1 mt-3" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onEdit(listing)}
              className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
            >Edit</button>
            {listing.status === 'active' && (
              <>
                <button
                  onClick={() => onMarkSold(listing)}
                  className="text-xs px-2 py-1 bg-gray-50 text-gray-700 rounded hover:bg-gray-100"
                >Mark Sold</button>
                <button
                  onClick={() => onInitiateSale(listing)}
                  className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100"
                >SS Sale</button>
              </>
            )}
            {(listing.status === 'sold' || listing.status === 'expired') && (
              <button
                onClick={() => onReactivate(listing)}
                className="text-xs px-2 py-1 bg-yellow-50 text-yellow-700 rounded hover:bg-yellow-100"
              >Reactivate</button>
            )}
            <button
              onClick={() => onDelete(listing)}
              className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100"
            >Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Listing Detail Modal ---

function ListingDetailModal({ listing, currentUserId, onClose, onEdit, onMarkSold, onInitiateSale, onReactivate, onDelete }) {
  if (!listing) return null;
  const isOwner = currentUserId && String(listing.sellerId && (listing.sellerId._id || listing.sellerId)) === String(currentUserId);
  const seller = listing.sellerId;
  const categoryDetails = getRequiredCategoryDetails(listing.category);
  const additionalDetails = normalizeAdditionalDetails(listing.additionalDetails);
  const conditionLabel = (CONDITION_OPTIONS.find(option => option.value === listing.condition) || {}).label;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-screen overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold text-gray-900">{listing.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        {listing.images && listing.images.length > 0 && (
          <div className="flex gap-2 p-4 overflow-x-auto">
            {listing.images.map((img, i) => (
              <img key={i} src={img} alt={'Image ' + (i + 1)} className="h-48 w-auto rounded object-cover flex-shrink-0" />
            ))}
          </div>
        )}
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl font-bold text-blue-600">{formatPrice(listing.price, listing.currency)}</span>
            <span className={'text-sm px-2 py-1 rounded-full ' + (STATUS_COLORS[listing.status] || '')}>
              {STATUS_LABELS[listing.status] || listing.status}
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-1">Category: {getCategoryLabel(listing.category)}</p>
          {conditionLabel && conditionLabel !== 'Not Applicable' && (
            <p className="text-xs text-gray-500 mb-1">Condition: {conditionLabel}</p>
          )}
          {(listing.city || listing.state) && (
            <p className="text-xs text-gray-500 mb-1">{'\u{1F4CD}'} {[listing.city, listing.state, listing.country].filter(Boolean).join(', ')}</p>
          )}
          {categoryDetails.length > 0 && (
            <div className="mt-2 text-xs text-gray-600 space-y-1">
              {categoryDetails.map(field => additionalDetails[field.key] ? (
                <p key={field.key}><span className="font-medium">{field.label}:</span> {additionalDetails[field.key]}</p>
              ) : null)}
            </div>
          )}
          <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">{listing.description}</p>
          {listing.externalLink && (
            <a href={listing.externalLink} target="_blank" rel="noreferrer" className="text-blue-600 text-sm underline mt-2 block">
              View External Link &rarr;
            </a>
          )}
          {seller && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-gray-500">
                Listed by <span className="font-medium text-gray-700">@{seller.username || 'unknown'}</span>
                {' \u00B7 '}{formatRelativeTime(listing.createdAt)}
                {listing.views > 0 ? ' \u00B7 ' + listing.views + ' views' : ''}
              </p>
            </div>
          )}
          {isOwner && (
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
              <button onClick={() => { onClose(); onEdit(listing); }} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Edit</button>
              {listing.status === 'active' && (
                <>
                  <button onClick={() => { onClose(); onMarkSold(listing); }} className="px-3 py-1.5 bg-gray-600 text-white rounded text-sm hover:bg-gray-700">Mark as Sold</button>
                  <button onClick={() => { onClose(); onInitiateSale(listing); }} className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700">SocialSecure Sale</button>
                </>
              )}
              {(listing.status === 'sold' || listing.status === 'expired') && (
                <button onClick={() => { onClose(); onReactivate(listing); }} className="px-3 py-1.5 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700">Reactivate</button>
              )}
              <button onClick={() => { onClose(); onDelete(listing); }} className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700">Delete</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Listing Form Modal ---

function ListingFormModal({ listing, onClose, onSaved }) {
  const isEdit = !!listing;
  const [form, setForm] = useState(() => {
    if (isEdit) {
      return {
        title: listing.title || '',
        description: listing.description || '',
        category: listing.category || '',
        condition: listing.condition || '',
        price: listing.price != null ? String(listing.price) : '',
        currency: listing.currency || 'USD',
        externalLink: listing.externalLink || '',
        additionalDetails: normalizeAdditionalDetails(listing.additionalDetails),
        images: listing.images || [],
        imageFiles: [],
        city: listing.city || '',
        state: listing.state || '',
        country: listing.country || '',
        latitude: (listing.location && listing.location.coordinates && listing.location.coordinates[1]) || '',
        longitude: (listing.location && listing.location.coordinates && listing.location.coordinates[0]) || '',
      };
    }
    return emptyListingForm;
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [expandedCat, setExpandedCat] = useState('');
  const requiredCategoryDetails = getRequiredCategoryDetails(form.category);
  const parentCategoryId = getParentCategoryId(form.category);

  const validate = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'Title is required';
    if (!form.description.trim()) errs.description = 'Description is required';
    if (!form.category) errs.category = 'Category is required';
    if (parentCategoryId === 'for-sale' && (!form.condition || form.condition === 'not_applicable')) errs.condition = 'Condition is required';
    requiredCategoryDetails.forEach(field => {
      if (!(form.additionalDetails[field.key] || '').trim()) {
        errs['additionalDetails.' + field.key] = field.label + ' is required';
      }
    });
    if (form.price === '' || isNaN(parseFloat(form.price)) || parseFloat(form.price) < 0) errs.price = 'Valid price is required';
    if (form.externalLink && !/^https?:\/\/.+/.test(form.externalLink)) errs.externalLink = 'Must be a valid URL (https://...)';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSaving(true);
    try {
      const hasImageUploads = form.imageFiles && form.imageFiles.length > 0;
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        condition: form.condition,
        price: parseFloat(form.price),
        currency: form.currency,
        additionalDetails: normalizeAdditionalDetails(form.additionalDetails),
        city: form.city.trim() || undefined,
        state: form.state.trim() || undefined,
        country: form.country.trim() || undefined,
        latitude: form.latitude ? parseFloat(form.latitude) : undefined,
        longitude: form.longitude ? parseFloat(form.longitude) : undefined,
      };
      if (form.externalLink.trim()) payload.externalLink = form.externalLink.trim();
      if (isEdit && !hasImageUploads) payload.images = form.images;
      let res;
      if (hasImageUploads) {
        const formData = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          if (value === undefined) return;
          if (key === 'additionalDetails' || key === 'images') {
            formData.append(key, JSON.stringify(value));
          } else {
            formData.append(key, String(value));
          }
        });
        form.imageFiles.forEach(file => formData.append('images', file));
        res = isEdit
          ? await marketAPI.updateListing(listing._id, formData)
          : await marketAPI.createListing(formData);
      } else {
        res = isEdit
          ? await marketAPI.updateListing(listing._id, payload)
          : await marketAPI.createListing(payload);
      }
      toast.success(isEdit ? 'Listing updated!' : 'Listing created!');
      onSaved(res.data.listing);
    } catch (err) {
      const msg = err.response?.data?.errors?.[0]?.msg || err.response?.data?.error || 'Failed to save listing';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) { toast.error('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => setForm(f => ({ ...f, latitude: pos.coords.latitude.toString(), longitude: pos.coords.longitude.toString() })),
      () => toast.error('Could not get location')
    );
  };

  const handleImageSelection = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length > MAX_LISTING_IMAGES) {
      toast.error(`Please select up to ${MAX_LISTING_IMAGES} images.`);
      event.target.value = '';
      setForm(f => ({ ...f, imageFiles: [] }));
      return;
    }
    setForm(f => ({ ...f, imageFiles: files.slice(0, MAX_LISTING_IMAGES) }));
  };

  const clearImageSelection = () => {
    setForm(f => ({ ...f, imageFiles: [] }));
  };

  const hasExistingImages = Array.isArray(form.images) && form.images.length > 0;
  const hasNewImages = Array.isArray(form.imageFiles) && form.imageFiles.length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-screen overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold">{isEdit ? 'Edit Listing' : 'Create New Listing'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className={'w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ' + (errors.title ? 'border-red-400' : 'border-gray-300')}
              maxLength={200}
              placeholder="What are you listing?"
            />
            {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
            <div className={'border rounded p-2 ' + (errors.category ? 'border-red-400' : 'border-gray-300')}>
              {CATEGORIES.map(cat => (
                <div key={cat.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedCat(expandedCat === cat.id ? '' : cat.id)}
                    className={'w-full text-left text-sm px-2 py-1.5 rounded flex items-center justify-between ' + (form.category === cat.id ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-50 text-gray-700')}
                  >
                    <span><span className="mr-2">{cat.icon}</span>{cat.name}</span>
                    <span className="text-gray-400 text-xs">{expandedCat === cat.id ? '\u25B2' : '\u25BC'}</span>
                  </button>
                  {expandedCat === cat.id && (
                    <div className="ml-4 border-l-2 border-gray-200 pl-2">
                      {cat.subcategories.map(sub => (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => { setForm(f => ({ ...f, category: sub.id })); setExpandedCat(''); }}
                          className={'w-full text-left text-xs px-2 py-1.5 rounded ' + (form.category === sub.id ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-600')}
                        >
                          <span className="mr-1">{sub.icon}</span>{sub.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {form.category && (
              <p className="text-xs text-blue-600 mt-1">Selected: {getCategoryLabel(form.category)}</p>
            )}
            {errors.category && <p className="text-red-500 text-xs mt-1">{errors.category}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Condition {parentCategoryId === 'for-sale' ? '*' : '(if applicable)'}</label>
            <select
              value={form.condition}
              onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}
              className={'w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ' + (errors.condition ? 'border-red-400' : 'border-gray-300')}
            >
              {CONDITION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {errors.condition && <p className="text-red-500 text-xs mt-1">{errors.condition}</p>}
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Price *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                className={'w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ' + (errors.price ? 'border-red-400' : 'border-gray-300')}
                placeholder="0.00"
              />
              {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select
                value={form.currency}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {requiredCategoryDetails.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Additional category details *</p>
              {requiredCategoryDetails.map(field => (
                <div key={field.key}>
                  <label className="block text-sm text-gray-700 mb-1">{field.label} *</label>
                  <input
                    type="text"
                    value={form.additionalDetails[field.key] || ''}
                    onChange={e => setForm(f => ({
                      ...f,
                      additionalDetails: { ...f.additionalDetails, [field.key]: e.target.value }
                    }))}
                    className={'w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ' + (errors['additionalDetails.' + field.key] ? 'border-red-400' : 'border-gray-300')}
                    placeholder={field.placeholder}
                  />
                  {errors['additionalDetails.' + field.key] && (
                    <p className="text-red-500 text-xs mt-1">{errors['additionalDetails.' + field.key]}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={4}
              className={'w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ' + (errors.description ? 'border-red-400' : 'border-gray-300')}
              maxLength={5000}
              placeholder="Describe your listing in detail..."
            />
            {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Listing Images (optional)</label>
            {hasExistingImages && (
              <div className="flex gap-2 overflow-x-auto mb-2">
                {form.images.map((img, index) => (
                  <img
                    key={`${img}-${index}`}
                    src={img}
                    alt={`Existing listing ${index + 1}`}
                    className="h-20 w-28 rounded object-cover flex-shrink-0 border border-gray-200"
                  />
                ))}
              </div>
            )}
            {hasExistingImages && hasNewImages && (
              <p className="text-xs text-amber-600 mb-2">uploading new images will replace the existing ones.</p>
            )}
            {hasNewImages && (
              <ul className="mb-2 text-xs text-gray-600 space-y-1">
                {form.imageFiles.map(file => (
                  <li key={file.name}>{file.name}</li>
                ))}
              </ul>
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageSelection}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {hasNewImages && (
              <button type="button" onClick={clearImageSelection} className="text-xs text-blue-600 hover:underline mt-2">
                Clear selected images
              </button>
            )}
            <p className="text-xs text-gray-500 mt-2">PNG, JPG, GIF, WebP, or BMP up to 3MB each. Up to {MAX_LISTING_IMAGES} images.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">External Link (optional)</label>
            <input
              type="url"
              value={form.externalLink}
              onChange={e => setForm(f => ({ ...f, externalLink: e.target.value }))}
              className={'w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ' + (errors.externalLink ? 'border-red-400' : 'border-gray-300')}
              placeholder="https://..."
            />
            {errors.externalLink && <p className="text-red-500 text-xs mt-1">{errors.externalLink}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Location (optional)</label>
              <button type="button" onClick={useMyLocation} className="text-xs text-blue-600 hover:underline">
                Use my location
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="City" className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input type="text" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} placeholder="State" className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input type="text" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} placeholder="Country" className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            {(form.latitude || form.longitude) && (
              <p className="text-xs text-green-600 mt-1">Coordinates set: {form.latitude}, {form.longitude}</p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="flex-1 bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : (isEdit ? 'Update Listing' : 'Create Listing')}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Initiate Sale Modal ---

function InitiateSaleModal({ listing, onClose, onSuccess }) {
  const [buyerSearch, setBuyerSearch] = useState('');
  const [buyerResults, setBuyerResults] = useState([]);
  const [selectedBuyer, setSelectedBuyer] = useState(null);
  const [sellerAnonymous, setSellerAnonymous] = useState(false);
  const [buyerAnonymous, setBuyerAnonymous] = useState(false);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const searchTimeout = useRef(null);

  const searchBuyers = useCallback(async (q) => {
    if (q.trim().length < 2) { setBuyerResults([]); return; }
    setSearching(true);
    try {
      const res = await marketAPI.searchUsers(q.trim());
      setBuyerResults(res.data?.users || []);
    } catch {
      setBuyerResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleBuyerSearchChange = (e) => {
    const q = e.target.value;
    setBuyerSearch(q);
    setSelectedBuyer(null);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchBuyers(q), 400);
  };

  const handleSubmit = async () => {
    if (!selectedBuyer) { toast.error('Please select a buyer'); return; }
    setSubmitting(true);
    try {
      await marketAPI.initiateSale(listing._id, {
        buyerId: selectedBuyer._id,
        sellerAnonymous,
        buyerAnonymous,
      });
      toast.success('@' + selectedBuyer.username + ' has been notified of the transaction request.');
      onSuccess();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to initiate sale');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Initiate SocialSecure Sale</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-blue-50 rounded p-3">
            <p className="text-sm font-medium text-blue-900">{listing.title}</p>
            <p className="text-sm text-blue-700">{formatPrice(listing.price, listing.currency)}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search for Buyer</label>
            <input
              type="text"
              value={buyerSearch}
              onChange={handleBuyerSearchChange}
              placeholder="Search by username or name..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searching && <p className="text-xs text-gray-500 mt-1">Searching...</p>}
            {buyerResults.length > 0 && !selectedBuyer && (
              <div className="border border-gray-200 rounded mt-1 max-h-40 overflow-y-auto">
                {buyerResults.map(user => (
                  <button
                    key={user._id}
                    type="button"
                    onClick={() => { setSelectedBuyer(user); setBuyerSearch(user.username); setBuyerResults([]); }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b last:border-0"
                  >
                    <span className="font-medium">@{user.username}</span>
                    {user.realName && <span className="text-gray-500 ml-2">({user.realName})</span>}
                    {(user.city || user.state) && (
                      <span className="text-gray-400 ml-2 text-xs">{[user.city, user.state].filter(Boolean).join(', ')}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {selectedBuyer && (
              <div className="mt-1 p-2 bg-green-50 rounded flex items-center justify-between">
                <span className="text-sm text-green-700">Selected: <strong>@{selectedBuyer.username}</strong></span>
                <button type="button" onClick={() => { setSelectedBuyer(null); setBuyerSearch(''); }} className="text-xs text-red-500 hover:underline">Clear</button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Anonymity Options</p>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={sellerAnonymous} onChange={e => setSellerAnonymous(e.target.checked)} className="rounded" />
              Remain anonymous as seller
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={buyerAnonymous} onChange={e => setBuyerAnonymous(e.target.checked)} className="rounded" />
              Make buyer anonymous in trade history
            </label>
            {(sellerAnonymous || buyerAnonymous) && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded p-2">
                {sellerAnonymous && buyerAnonymous
                  ? 'This transaction will appear in trade history but neither party nor the item will be identified.'
                  : sellerAnonymous
                    ? 'Your identity as seller will be hidden in trade history.'
                    : "The buyer's identity will be hidden in trade history."}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !selectedBuyer}
              className="flex-1 bg-green-600 text-white py-2 rounded font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? 'Sending...' : 'Send Transaction Request'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Transaction Card ---

function TransactionCard({ transaction, currentUserId, onRespond }) {
  const isBuyer = String((transaction.buyerId && (transaction.buyerId._id || transaction.buyerId))) === String(currentUserId);
  const listing = transaction.listingId;

  const otherParty = isBuyer
    ? (transaction.sellerAnonymous ? { username: 'Anonymous' } : transaction.sellerId)
    : (transaction.buyerAnonymous ? { username: 'Anonymous' } : transaction.buyerId);

  return (
    <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="font-medium text-gray-900 text-sm">
            {listing ? listing.title : (transaction.listingTitle || 'Deleted listing')}
          </p>
          <p className="text-blue-600 font-semibold">{formatPrice(transaction.amount, transaction.currency)}</p>
          <p className="text-xs text-gray-500 mt-1">
            {isBuyer ? 'Seller' : 'Buyer'}: @{(otherParty && otherParty.username) || 'Unknown'}
          </p>
          <p className="text-xs text-gray-400">{formatRelativeTime(transaction.createdAt)}</p>
        </div>
        <span className={'text-xs px-2 py-1 rounded-full flex-shrink-0 ' + (
          transaction.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
          transaction.status === 'accepted' ? 'bg-green-100 text-green-800' :
          'bg-red-100 text-red-800'
        )}>
          {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
        </span>
      </div>
      {isBuyer && transaction.status === 'pending' && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onRespond(transaction, 'accept')}
            className="flex-1 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
          >
            Accept
          </button>
          <button
            onClick={() => onRespond(transaction, 'reject')}
            className="flex-1 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700"
          >
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

// --- Trade History Row ---

function TradeHistoryRow({ entry }) {
  const isBothAnon = !entry.seller && !entry.buyer;

  return (
    <div className="bg-white rounded border border-gray-200 p-3 flex items-center justify-between">
      <div className="flex-1">
        {isBothAnon ? (
          <p className="text-sm text-gray-600 italic">Anonymous transaction</p>
        ) : (
          <p className="text-sm text-gray-800">
            {entry.listingTitle
              ? <span className="font-medium">"{entry.listingTitle}"</span>
              : <span className="italic text-gray-500">Item hidden</span>}
            {entry.seller && <span className="text-gray-500"> &middot; by @{entry.seller.username}</span>}
            {entry.buyer && <span className="text-gray-500"> &rarr; @{entry.buyer.username}</span>}
          </p>
        )}
        <p className="text-xs text-gray-400 mt-0.5">{formatRelativeTime(entry.completedAt)}</p>
      </div>
      <div className="text-right flex-shrink-0 ml-3">
        <p className="font-semibold text-gray-800">{formatPrice(entry.amount, entry.currency)}</p>
        {(entry.sellerAnonymous || entry.buyerAnonymous) && (
          <p className="text-xs text-gray-400">Partial anonymous</p>
        )}
      </div>
    </div>
  );
}

// --- Main Component ---

function Market() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentUser, setCurrentUser] = useState(null);

  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'browse');

  // Browse state
  const [listings, setListings] = useState([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [listingError, setListingError] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [selectedCategory, setSelectedCategory] = useState('');
  const [expandedCats, setExpandedCats] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [maxDistance, setMaxDistance] = useState(50);
  const [useLocation, setUseLocation] = useState(false);
  const [userCoords, setUserCoords] = useState(null);
  const [locationError, setLocationError] = useState('');

  // My listings state
  const [myListings, setMyListings] = useState([]);
  const [loadingMyListings, setLoadingMyListings] = useState(false);

  // Transactions state
  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  // Trade history state
  const [tradeHistory, setTradeHistory] = useState([]);
  const [loadingTradeHistory, setLoadingTradeHistory] = useState(false);
  const [tradePagination, setTradePagination] = useState({ page: 1, pages: 1, total: 0 });

  // Modal state
  const [viewListing, setViewListing] = useState(null);
  const [editListing, setEditListing] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [initiateSaleListing, setInitiateSaleListing] = useState(null);

  const filtersRef = useRef({ selectedCategory, appliedSearch, priceMin, priceMax, maxDistance, useLocation, userCoords });

  useEffect(() => {
    filtersRef.current = { selectedCategory, appliedSearch, priceMin, priceMax, maxDistance, useLocation, userCoords };
  });

  useEffect(() => {
    authAPI.getProfile().then(res => setCurrentUser(res.data?.user)).catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  useEffect(() => {
    if (activeTab === 'browse') fetchListings(1);
  }, [activeTab, selectedCategory, appliedSearch, priceMin, priceMax, maxDistance, useLocation, userCoords]);

  useEffect(() => {
    if (activeTab === 'myListings' && currentUser) fetchMyListings();
  }, [activeTab, currentUser]);

  useEffect(() => {
    if (activeTab === 'transactions' && currentUser) fetchTransactions();
  }, [activeTab, currentUser]);

  useEffect(() => {
    if (activeTab === 'tradeHistory') fetchTradeHistory(1);
  }, [activeTab]);

  const buildFilters = useCallback(() => {
    const f = filtersRef.current;
    const filters = {};
    if (f.selectedCategory) filters.category = f.selectedCategory;
    if (f.appliedSearch) filters.q = f.appliedSearch;
    if (f.priceMin) filters.minPrice = f.priceMin;
    if (f.priceMax) filters.maxPrice = f.priceMax;
    if (f.useLocation && f.userCoords) {
      filters.latitude = f.userCoords.lat;
      filters.longitude = f.userCoords.lng;
      filters.maxDistance = f.maxDistance;
    }
    return filters;
  }, []);

  const fetchListings = async (page = 1) => {
    setLoadingListings(true);
    setListingError(null);
    try {
      const res = await marketAPI.getListings(buildFilters(), page);
      setListings(res.data?.listings || []);
      setPagination(res.data?.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      setListingError(err?.response?.data?.error || 'Failed to load listings');
    } finally {
      setLoadingListings(false);
    }
  };

  const fetchMyListings = async () => {
    setLoadingMyListings(true);
    try {
      const res = await marketAPI.getUserListings();
      setMyListings(res.data?.listings || []);
    } catch {
      toast.error('Failed to load your listings');
    } finally {
      setLoadingMyListings(false);
    }
  };

  const fetchTransactions = async () => {
    setLoadingTransactions(true);
    try {
      const res = await marketAPI.getTransactions();
      setTransactions(res.data?.transactions || []);
    } catch {
      toast.error('Failed to load transactions');
    } finally {
      setLoadingTransactions(false);
    }
  };

  const fetchTradeHistory = async (page = 1) => {
    setLoadingTradeHistory(true);
    try {
      const res = await marketAPI.getTradeHistory(page);
      setTradeHistory(res.data?.history || []);
      setTradePagination(res.data?.pagination || { page: 1, pages: 1, total: 0 });
    } catch {
      toast.error('Failed to load trade history');
    } finally {
      setLoadingTradeHistory(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(searchInput);
  };

  const handleToggleLocation = () => {
    if (!useLocation) {
      if (!navigator.geolocation) { setLocationError('Geolocation not supported by your browser'); return; }
      navigator.geolocation.getCurrentPosition(
        pos => { setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setUseLocation(true); setLocationError(''); },
        () => setLocationError('Could not get your location. Please allow location access.')
      );
    } else {
      setUseLocation(false);
    }
  };

  const handleListingCreated = () => {
    setShowCreateForm(false);
    if (activeTab === 'myListings') fetchMyListings();
    if (activeTab === 'browse') fetchListings(1);
  };

  const handleListingUpdated = () => {
    setEditListing(null);
    fetchMyListings();
    if (activeTab === 'browse') fetchListings(1);
  };

  const handleDelete = async (listing) => {
    if (!window.confirm('Delete "' + listing.title + '"?')) return;
    try {
      await marketAPI.deleteListing(listing._id);
      toast.success('Listing deleted');
      fetchMyListings();
      if (activeTab === 'browse') fetchListings(1);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to delete listing');
    }
  };

  const handleMarkSold = async (listing) => {
    if (!window.confirm('Mark "' + listing.title + '" as sold?')) return;
    try {
      await marketAPI.markAsSold(listing._id);
      toast.success('Listing marked as sold');
      fetchMyListings();
      if (activeTab === 'browse') fetchListings(1);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to mark as sold');
    }
  };

  const handleReactivate = async (listing) => {
    try {
      await marketAPI.reactivateListing(listing._id);
      toast.success('Listing reactivated');
      fetchMyListings();
      if (activeTab === 'browse') fetchListings(1);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to reactivate listing');
    }
  };

  const handleInitiateSaleSuccess = () => {
    setInitiateSaleListing(null);
    fetchMyListings();
    if (activeTab === 'browse') fetchListings(1);
  };

  const handleTransactionRespond = async (transaction, response) => {
    const label = response === 'accept' ? 'accept' : 'decline';
    if (!window.confirm('Are you sure you want to ' + label + ' this transaction?')) return;
    try {
      await marketAPI.respondToTransaction(transaction._id, response);
      toast.success(response === 'accept' ? 'Transaction accepted!' : 'Transaction declined.');
      fetchTransactions();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to respond to transaction');
    }
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setSearchParams(tab !== 'browse' ? { tab } : {});
  };

  const clearFilters = () => {
    setSearchInput('');
    setAppliedSearch('');
    setSelectedCategory('');
    setPriceMin('');
    setPriceMax('');
    setUseLocation(false);
  };

  const pendingAsBuyer = transactions.filter(t =>
    t.status === 'pending' && String((t.buyerId && (t.buyerId._id || t.buyerId))) === String(currentUser && currentUser._id)
  );

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white rounded-lg shadow mb-4 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Marketplace</h1>
            <p className="text-sm text-gray-500">Buy, sell, and trade with your community</p>
          </div>
          {currentUser && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex-shrink-0"
            >
              + Add a Listing
            </button>
          )}
        </div>

        <div className="flex gap-1 mt-4 border-b border-gray-200">
          {[
            { id: 'browse', label: 'Browse' },
            ...(currentUser ? [{ id: 'myListings', label: 'My Listings' }] : []),
            ...(currentUser ? [{ id: 'transactions', label: 'Transactions' + (pendingAsBuyer.length > 0 ? ' (' + pendingAsBuyer.length + ')' : '') }] : []),
            { id: 'tradeHistory', label: 'Trade History' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ' + (
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'browse' && (
        <div className="flex gap-4">
          <div className="w-56 flex-shrink-0 space-y-4">
            <CategorySidebar
              selected={selectedCategory}
              onSelect={setSelectedCategory}
              expandedCats={expandedCats}
              onToggle={(id) => setExpandedCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])}
            />

            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-gray-800 mb-3">Price Range</h3>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min="0"
                  value={priceMin}
                  onChange={e => setPriceMin(e.target.value)}
                  placeholder="Min"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-gray-400 text-sm">-</span>
                <input
                  type="number"
                  min="0"
                  value={priceMax}
                  onChange={e => setPriceMax(e.target.value)}
                  placeholder="Max"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-gray-800 mb-3">Location Filter</h3>
              <button
                onClick={handleToggleLocation}
                className={'w-full py-1.5 px-3 rounded text-sm font-medium transition-colors ' + (
                  useLocation
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                {useLocation ? 'Location On' : 'Enable Location'}
              </button>
              {locationError && <p className="text-red-500 text-xs mt-1">{locationError}</p>}
              {useLocation && (
                <div className="mt-3">
                  <label className="block text-xs text-gray-600 mb-1">
                    Max Distance: <strong>{maxDistance} miles</strong>
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="200"
                    step="5"
                    value={maxDistance}
                    onChange={e => setMaxDistance(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>5mi</span>
                    <span>200mi</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1">
            <form onSubmit={handleSearchSubmit} className="flex gap-2 mb-4">
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search listings by title or description..."
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
                Search
              </button>
              {(appliedSearch || selectedCategory || priceMin || priceMax || useLocation) && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-300"
                >
                  Clear
                </button>
              )}
            </form>

            {(appliedSearch || selectedCategory) && (
              <div className="flex flex-wrap gap-2 mb-3">
                {appliedSearch && (
                  <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
                    Search: "{appliedSearch}"
                  </span>
                )}
                {selectedCategory && (
                  <span className="bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded-full">
                    {getCategoryLabel(selectedCategory)}
                  </span>
                )}
              </div>
            )}

            {loadingListings ? (
              <div className="text-center py-12 text-gray-500">Loading listings...</div>
            ) : listingError ? (
              <div className="bg-red-50 text-red-700 rounded p-4">{listingError}</div>
            ) : listings.length === 0 ? (
              <div className="text-center py-12 text-gray-500 bg-white rounded-lg shadow">
                <p className="text-4xl mb-3">No listings found</p>
                <p className="text-sm mt-1">Try adjusting your filters or search terms</p>
                {currentUser && (
                  <button onClick={() => setShowCreateForm(true)} className="mt-4 bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
                    Add a Listing
                  </button>
                )}
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-3">{pagination.total} listing{pagination.total !== 1 ? 's' : ''} found</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {listings.map(listing => (
                    <ListingCard
                      key={listing._id}
                      listing={listing}
                      currentUserId={currentUser && currentUser._id}
                      onView={setViewListing}
                      onEdit={setEditListing}
                      onDelete={handleDelete}
                      onMarkSold={handleMarkSold}
                      onInitiateSale={setInitiateSaleListing}
                      onReactivate={handleReactivate}
                    />
                  ))}
                </div>
                {pagination.pages > 1 && (
                  <div className="flex justify-center gap-2 mt-6">
                    {pagination.page > 1 && (
                      <button onClick={() => fetchListings(pagination.page - 1)} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">Prev</button>
                    )}
                    <span className="px-3 py-1.5 text-sm text-gray-600">Page {pagination.page} of {pagination.pages}</span>
                    {pagination.page < pagination.pages && (
                      <button onClick={() => fetchListings(pagination.page + 1)} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">Next</button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'myListings' && currentUser && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">My Listings</h2>
            <button onClick={() => setShowCreateForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">+ Add a Listing</button>
          </div>
          {loadingMyListings ? (
            <p className="text-gray-500 text-center py-8">Loading...</p>
          ) : myListings.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="font-medium">No listings yet</p>
              <p className="text-sm mt-1">Create your first listing to start selling</p>
              <button onClick={() => setShowCreateForm(true)} className="mt-4 bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">Add a Listing</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {myListings.map(listing => (
                <ListingCard
                  key={listing._id}
                  listing={listing}
                  currentUserId={currentUser._id}
                  onView={setViewListing}
                  onEdit={setEditListing}
                  onDelete={handleDelete}
                  onMarkSold={handleMarkSold}
                  onInitiateSale={setInitiateSaleListing}
                  onReactivate={handleReactivate}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'transactions' && currentUser && (
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Transactions</h2>
          {loadingTransactions ? (
            <p className="text-gray-500 text-center py-8">Loading...</p>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="font-medium">No transactions yet</p>
              <p className="text-sm mt-1">Transactions will appear here when you initiate or receive SocialSecure sales</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingAsBuyer.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-yellow-700 bg-yellow-50 rounded px-3 py-2 mb-2">
                    Pending Responses Required ({pendingAsBuyer.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    {pendingAsBuyer.map(t => (
                      <TransactionCard
                        key={t._id}
                        transaction={t}
                        currentUserId={currentUser._id}
                        onRespond={handleTransactionRespond}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h3 className="text-sm font-semibold text-gray-600 mb-2">All Transactions</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {transactions.map(t => (
                    <TransactionCard
                      key={t._id}
                      transaction={t}
                      currentUserId={currentUser._id}
                      onRespond={handleTransactionRespond}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'tradeHistory' && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Public Trade History</h2>
            <p className="text-sm text-gray-500">Completed SocialSecure transactions visible to all users. Anonymous entries hide party and item details.</p>
          </div>
          {loadingTradeHistory ? (
            <p className="text-gray-500 text-center py-8">Loading...</p>
          ) : tradeHistory.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="font-medium">No completed trades yet</p>
              <p className="text-sm mt-1">Accepted SocialSecure transactions will appear here</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {tradeHistory.map(entry => (
                  <TradeHistoryRow key={entry._id} entry={entry} />
                ))}
              </div>
              {tradePagination.pages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  {tradePagination.page > 1 && (
                    <button onClick={() => fetchTradeHistory(tradePagination.page - 1)} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">Prev</button>
                  )}
                  <span className="px-3 py-1.5 text-sm text-gray-600">Page {tradePagination.page} of {tradePagination.pages}</span>
                  {tradePagination.page < tradePagination.pages && (
                    <button onClick={() => fetchTradeHistory(tradePagination.page + 1)} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">Next</button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {viewListing && (
        <ListingDetailModal
          listing={viewListing}
          currentUserId={currentUser && currentUser._id}
          onClose={() => setViewListing(null)}
          onEdit={setEditListing}
          onMarkSold={handleMarkSold}
          onInitiateSale={setInitiateSaleListing}
          onReactivate={handleReactivate}
          onDelete={handleDelete}
        />
      )}

      {(showCreateForm || editListing) && (
        <ListingFormModal
          listing={editListing || null}
          onClose={() => { setShowCreateForm(false); setEditListing(null); }}
          onSaved={editListing ? handleListingUpdated : handleListingCreated}
        />
      )}

      {initiateSaleListing && (
        <InitiateSaleModal
          listing={initiateSaleListing}
          onClose={() => setInitiateSaleListing(null)}
          onSuccess={handleInitiateSaleSuccess}
        />
      )}
    </div>
  );
}

export default Market;
