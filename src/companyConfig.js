/**
 * Company Configuration
 * Central config for all supported companies
 */

const COMPANIES = {
  msb: {
    id: 'msb',
    name: 'Midwest Service Bureau, LLC',
    shortName: 'Midwest Service Bureau',
    tagline: 'COLLECTIONS SPECIALISTS SINCE 1970',
    address: '625 W Maple St., Wichita, KS 67213',
    nmls: '2671949',
    phone: '(316) 267-8300',
    email: 'info@msbureau.com',
    website: 'www.msbureau.com',
    defaultRate: 30,
    legalRateAddon: 10, // Legal rate = standard + this
    licensing: 'nationwide', // MSB operates nationwide
    colors: {
      primary: '6B2D8B',      // Purple
      secondary: '2E7D32',    // Green
      accent: 'FF6B35',       // Orange
    },
    keywords: ['msb', 'midwest', 'service bureau', 'msbureau']
  },

  vegasvalley: {
    id: 'vegasvalley',
    name: 'Vegas Valley Collection Service',
    shortName: 'Vegas Valley Collection Service',
    tagline: 'NEVADA\'S TRUSTED COLLECTION EXPERTS',
    addresses: [
      '304 S. Jones Blvd #2596, Las Vegas, NV 89107'
    ],
    address: '304 S. Jones Blvd #2596, Las Vegas, NV 89107',
    nmls: '2364012',
    phone: '(702) 645-9710',
    email: 'info@vegascollect.com',
    website: 'vegascollect.com',
    defaultRate: 30,
    legalRateAddon: 10,
    licensing: 'Nevada only', // Vegas Valley is ONLY licensed in Nevada
    colors: {
      primary: '1A1A2E',      // Dark navy/black
      secondary: '333333',    // Dark gray
      accent: '0066CC',       // Blue
    },
    keywords: ['vegas', 'valley', 'vegas valley', 'vegascollect', 'vv', 'nevada']
  }
};

// Default company if not specified
const DEFAULT_COMPANY = 'msb';

/**
 * Detect company from text input
 */
function detectCompany(text) {
  const lowerText = text.toLowerCase();

  // Check for explicit company field first
  const companyMatch = text.match(/Company:\s*(.+?)(?:\n|$)/i);
  if (companyMatch) {
    const companyValue = companyMatch[1].toLowerCase().trim();

    // Check Vegas Valley keywords
    if (COMPANIES.vegasvalley.keywords.some(k => companyValue.includes(k))) {
      return COMPANIES.vegasvalley;
    }

    // Check MSB keywords
    if (COMPANIES.msb.keywords.some(k => companyValue.includes(k))) {
      return COMPANIES.msb;
    }
  }

  // Auto-detect from full text
  const vegasKeywords = ['vegas valley', 'vegascollect', 'vegas collect', 'nevada collection'];
  if (vegasKeywords.some(k => lowerText.includes(k))) {
    return COMPANIES.vegasvalley;
  }

  // Default to MSB
  return COMPANIES.msb;
}

/**
 * Get company by ID
 */
function getCompany(id) {
  return COMPANIES[id] || COMPANIES[DEFAULT_COMPANY];
}

module.exports = {
  COMPANIES,
  DEFAULT_COMPANY,
  detectCompany,
  getCompany
};
