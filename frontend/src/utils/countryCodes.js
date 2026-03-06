const PRIORITY_COUNTRY_CODES = [
  'IN', 'CN', 'US', 'ID', 'PK',
  'NG', 'BR', 'BD', 'RU', 'ET',
  'MX', 'JP', 'EG', 'PH', 'CD',
  'VN', 'IR', 'TR', 'DE', 'TH'
];

const FALLBACK_COUNTRIES = [
  { code: 'IN', name: 'India' },
  { code: 'CN', name: 'China' },
  { code: 'US', name: 'United States' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'BR', name: 'Brazil' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'RU', name: 'Russia' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'MX', name: 'Mexico' },
  { code: 'JP', name: 'Japan' },
  { code: 'EG', name: 'Egypt' },
  { code: 'PH', name: 'Philippines' },
  { code: 'CD', name: 'Democratic Republic of the Congo' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'IR', name: 'Iran' },
  { code: 'TR', name: 'Turkey' },
  { code: 'DE', name: 'Germany' },
  { code: 'TH', name: 'Thailand' }
];

const buildCountryCodeOptions = () => {
  if (
    typeof Intl === 'undefined'
    || typeof Intl.DisplayNames !== 'function'
    || typeof Intl.supportedValuesOf !== 'function'
  ) {
    return FALLBACK_COUNTRIES;
  }

  let displayNames;
  let supportedRegions;

  try {
    displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
    supportedRegions = Intl.supportedValuesOf('region');
  } catch {
    return FALLBACK_COUNTRIES;
  }

  const countryOptions = supportedRegions
    .filter((code) => /^[A-Z]{2}$/.test(code))
    .map((code) => ({
      code,
      name: displayNames.of(code)
    }))
    .filter((option) => option.name && option.name !== option.code);

  if (!countryOptions.length) {
    return FALLBACK_COUNTRIES;
  }

  const byCode = new Map(countryOptions.map((option) => [option.code, option]));
  const priorityOptions = PRIORITY_COUNTRY_CODES
    .map((code) => byCode.get(code))
    .filter(Boolean);
  const prioritySet = new Set(priorityOptions.map((option) => option.code));
  const remainingOptions = countryOptions
    .filter((option) => !prioritySet.has(option.code))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...priorityOptions, ...remainingOptions];
};

export const COUNTRY_CODE_OPTIONS = buildCountryCodeOptions();
