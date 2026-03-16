const { CATEGORY_ORDER } = require('./newsCategoryFeeds');

const STATE_DISCOVERY_ROOMS = Object.freeze([
  { code: 'AL', name: 'Alabama', counties: ['Jefferson County', 'Mobile County', 'Madison County', 'Montgomery County', 'Shelby County', 'Baldwin County'] },
  { code: 'AK', name: 'Alaska', counties: ['Anchorage Municipality', 'Matanuska-Susitna Borough', 'Fairbanks North Star Borough', 'Kenai Peninsula Borough', 'Juneau City and Borough', 'Bethel Census Area'] },
  { code: 'AZ', name: 'Arizona', counties: ['Maricopa County', 'Pima County', 'Pinal County', 'Yavapai County', 'Mohave County', 'Yuma County'] },
  { code: 'AR', name: 'Arkansas', counties: ['Pulaski County', 'Benton County', 'Washington County', 'Craighead County', 'Sebastian County', 'Faulkner County'] },
  { code: 'CA', name: 'California', counties: ['Los Angeles County', 'San Diego County', 'Orange County', 'Riverside County', 'San Bernardino County', 'Santa Clara County'] },
  { code: 'CO', name: 'Colorado', counties: ['El Paso County', 'Denver County', 'Arapahoe County', 'Jefferson County', 'Adams County', 'Douglas County'] },
  { code: 'CT', name: 'Connecticut', counties: ['Fairfield County', 'Hartford County', 'New Haven County', 'New London County', 'Litchfield County', 'Middlesex County'] },
  { code: 'DE', name: 'Delaware', counties: ['New Castle County', 'Sussex County', 'Kent County'] },
  { code: 'FL', name: 'Florida', counties: ['Miami-Dade County', 'Broward County', 'Palm Beach County', 'Hillsborough County', 'Orange County', 'Pinellas County'] },
  { code: 'GA', name: 'Georgia', counties: ['Fulton County', 'Gwinnett County', 'Cobb County', 'DeKalb County', 'Clayton County', 'Cherokee County'] },
  { code: 'HI', name: 'Hawaii', counties: ['Honolulu County', 'Hawaii County', 'Maui County', 'Kauai County', 'Kalawao County'] },
  { code: 'ID', name: 'Idaho', counties: ['Ada County', 'Canyon County', 'Kootenai County', 'Bonneville County', 'Twin Falls County', 'Bannock County'] },
  { code: 'IL', name: 'Illinois', counties: ['Cook County', 'DuPage County', 'Lake County', 'Will County', 'Kane County', 'McHenry County'] },
  { code: 'IN', name: 'Indiana', counties: ['Marion County', 'Lake County', 'Allen County', 'Hamilton County', 'St. Joseph County', 'Elkhart County'] },
  { code: 'IA', name: 'Iowa', counties: ['Polk County', 'Linn County', 'Scott County', 'Johnson County', 'Black Hawk County', 'Woodbury County'] },
  { code: 'KS', name: 'Kansas', counties: ['Johnson County', 'Sedgwick County', 'Shawnee County', 'Wyandotte County', 'Douglas County', 'Leavenworth County'] },
  { code: 'KY', name: 'Kentucky', counties: ['Jefferson County', 'Fayette County', 'Kenton County', 'Boone County', 'Warren County', 'Hardin County'] },
  { code: 'LA', name: 'Louisiana', counties: ['East Baton Rouge Parish', 'Jefferson Parish', 'Orleans Parish', 'St. Tammany Parish', 'Lafayette Parish', 'Caddo Parish'] },
  { code: 'ME', name: 'Maine', counties: ['Cumberland County', 'York County', 'Penobscot County', 'Kennebec County', 'Androscoggin County', 'Aroostook County'] },
  { code: 'MD', name: 'Maryland', counties: ['Montgomery County', "Prince George's County", 'Baltimore County', 'Anne Arundel County', 'Howard County', 'Frederick County'] },
  { code: 'MA', name: 'Massachusetts', counties: ['Middlesex County', 'Worcester County', 'Essex County', 'Suffolk County', 'Norfolk County', 'Bristol County'] },
  { code: 'MI', name: 'Michigan', counties: ['Wayne County', 'Oakland County', 'Macomb County', 'Kent County', 'Genesee County', 'Washtenaw County'] },
  { code: 'MN', name: 'Minnesota', counties: ['Hennepin County', 'Ramsey County', 'Dakota County', 'Anoka County', 'Washington County', 'St. Louis County'] },
  { code: 'MS', name: 'Mississippi', counties: ['Hinds County', 'Harrison County', 'DeSoto County', 'Rankin County', 'Jackson County', 'Madison County'] },
  { code: 'MO', name: 'Missouri', counties: ['St. Louis County', 'Jackson County', 'St. Charles County', 'Greene County', 'Clay County', 'Jefferson County'] },
  { code: 'MT', name: 'Montana', counties: ['Yellowstone County', 'Missoula County', 'Gallatin County', 'Flathead County', 'Cascade County', 'Lewis and Clark County'] },
  { code: 'NE', name: 'Nebraska', counties: ['Douglas County', 'Lancaster County', 'Sarpy County', 'Hall County', 'Buffalo County', 'Dodge County'] },
  { code: 'NV', name: 'Nevada', counties: ['Clark County', 'Washoe County', 'Lyon County', 'Elko County', 'Nye County', 'Douglas County'] },
  { code: 'NH', name: 'New Hampshire', counties: ['Hillsborough County', 'Rockingham County', 'Merrimack County', 'Strafford County', 'Grafton County', 'Belknap County'] },
  { code: 'NJ', name: 'New Jersey', counties: ['Bergen County', 'Middlesex County', 'Essex County', 'Hudson County', 'Monmouth County', 'Ocean County'] },
  { code: 'NM', name: 'New Mexico', counties: ['Bernalillo County', 'Dona Ana County', 'Santa Fe County', 'Sandoval County', 'San Juan County', 'Valencia County'] },
  { code: 'NY', name: 'New York', counties: ['Kings County', 'Queens County', 'New York County', 'Suffolk County', 'Bronx County', 'Nassau County'] },
  { code: 'NC', name: 'North Carolina', counties: ['Wake County', 'Mecklenburg County', 'Guilford County', 'Forsyth County', 'Cumberland County', 'Durham County'] },
  { code: 'ND', name: 'North Dakota', counties: ['Cass County', 'Burleigh County', 'Grand Forks County', 'Ward County', 'Williams County', 'Stark County'] },
  { code: 'OH', name: 'Ohio', counties: ['Cuyahoga County', 'Franklin County', 'Hamilton County', 'Summit County', 'Montgomery County', 'Lucas County'] },
  { code: 'OK', name: 'Oklahoma', counties: ['Oklahoma County', 'Tulsa County', 'Cleveland County', 'Canadian County', 'Comanche County', 'Rogers County'] },
  { code: 'OR', name: 'Oregon', counties: ['Multnomah County', 'Washington County', 'Clackamas County', 'Lane County', 'Marion County', 'Jackson County'] },
  { code: 'PA', name: 'Pennsylvania', counties: ['Philadelphia County', 'Allegheny County', 'Montgomery County', 'Bucks County', 'Delaware County', 'Lancaster County'] },
  { code: 'RI', name: 'Rhode Island', counties: ['Providence County', 'Kent County', 'Washington County', 'Newport County', 'Bristol County'] },
  { code: 'SC', name: 'South Carolina', counties: ['Greenville County', 'Richland County', 'Charleston County', 'Horry County', 'Spartanburg County', 'Lexington County'] },
  { code: 'SD', name: 'South Dakota', counties: ['Minnehaha County', 'Pennington County', 'Lincoln County', 'Brown County', 'Brookings County', 'Codington County'] },
  { code: 'TN', name: 'Tennessee', counties: ['Shelby County', 'Davidson County', 'Knox County', 'Hamilton County', 'Rutherford County', 'Williamson County'] },
  { code: 'TX', name: 'Texas', counties: ['Harris County', 'Dallas County', 'Tarrant County', 'Bexar County', 'Travis County', 'Collin County'] },
  { code: 'UT', name: 'Utah', counties: ['Salt Lake County', 'Utah County', 'Davis County', 'Weber County', 'Washington County', 'Cache County'] },
  { code: 'VT', name: 'Vermont', counties: ['Chittenden County', 'Rutland County', 'Washington County', 'Windsor County', 'Franklin County', 'Addison County'] },
  { code: 'VA', name: 'Virginia', counties: ['Fairfax County', 'Prince William County', 'Loudoun County', 'Chesterfield County', 'Henrico County', 'Hanover County'] },
  { code: 'WA', name: 'Washington', counties: ['King County', 'Pierce County', 'Snohomish County', 'Spokane County', 'Clark County', 'Kitsap County'] },
  { code: 'WV', name: 'West Virginia', counties: ['Kanawha County', 'Berkeley County', 'Monongalia County', 'Cabell County', 'Wood County', 'Raleigh County'] },
  { code: 'WI', name: 'Wisconsin', counties: ['Milwaukee County', 'Dane County', 'Waukesha County', 'Brown County', 'Racine County', 'Outagamie County'] },
  { code: 'WY', name: 'Wyoming', counties: ['Laramie County', 'Natrona County', 'Campbell County', 'Sweetwater County', 'Albany County', 'Sheridan County'] }
].sort((left, right) => left.name.localeCompare(right.name)));

const TOPIC_LABEL_OVERRIDES = Object.freeze({
  ai: 'AI'
});

const formatTopicRoomName = (topicKey) => {
  const normalized = String(topicKey || '').trim().toLowerCase();
  if (!normalized) return 'General';
  if (TOPIC_LABEL_OVERRIDES[normalized]) return TOPIC_LABEL_OVERRIDES[normalized];
  return normalized
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const TOPIC_DISCOVERY_ROOMS = Object.freeze(
  CATEGORY_ORDER.map((key) => ({
    key,
    name: formatTopicRoomName(key)
  })).sort((left, right) => left.name.localeCompare(right.name))
);

module.exports = {
  STATE_DISCOVERY_ROOMS,
  TOPIC_DISCOVERY_ROOMS,
  formatTopicRoomName
};
