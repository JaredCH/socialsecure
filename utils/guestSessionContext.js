const DEFAULT_GUEST_SESSION_CONTEXT = Object.freeze({
  city: 'Austin',
  state: 'TX',
  country: 'US',
  county: 'Travis',
  zipCode: '78701',
  location: {
    type: 'Point',
    coordinates: [-97.7431, 30.2672]
  }
});

const guestSessionContext = (req, res, next) => {
  if (!req.user) {
    req.guestSessionContext = {
      ...DEFAULT_GUEST_SESSION_CONTEXT,
      location: {
        ...DEFAULT_GUEST_SESSION_CONTEXT.location,
        coordinates: [...DEFAULT_GUEST_SESSION_CONTEXT.location.coordinates]
      }
    };
  }
  next();
};

module.exports = {
  DEFAULT_GUEST_SESSION_CONTEXT,
  guestSessionContext
};
