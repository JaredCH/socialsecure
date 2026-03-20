/**
 * Derive two-letter initials from a realName or username.
 *
 * Priority: first letter of first name + first letter of last name from realName,
 * then first two characters of a single-word realName, then first two characters
 * of the username, then '?'.
 */
export const getInitials = (realName, username) => {
  const name = (realName || '').trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  }
  const user = (username || '').trim();
  if (user) return user.substring(0, 2).toUpperCase();
  return '?';
};
