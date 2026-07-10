/**
 * Natural Language Parser
 * Uses Claude AI to extract client information from natural conversation
 * Understands casual messages - no strict format required!
 */

const { detectCompany, COMPANIES } = require('./companyConfig');

// Medical keywords for auto-detection
const MEDICAL_KEYWORDS = [
  'medical', 'healthcare', 'hospital', 'clinic', 'patient', 'hipaa',
  'doctor', 'dental', 'dentist', 'physician', 'nursing', 'pharmacy',
  'health', 'chiropractic', 'chiropractor', 'chiro', 'optometry',
  'veterinary', 'vet', 'orthodont', 'dermatolog', 'cardio', 'nephrology',
  'dialysis', 'urgent care', 'physical therapy', 'pt clinic', 'rehab',
  'oral surgery', 'pediatric', 'ob-gyn', 'obgyn', 'radiology', 'oncology',
  'psychiatr', 'psycholog', 'therapy', 'counseling', 'mental health'
];

async function parseNaturalLanguage(anthropic, text, previousContext = null) {
  // Clean up common formatting issues
  const cleanedText = cleanInput(text);

  // Pre-detect some things for hints to AI
  const detectedCompany = detectCompany(text);
  const detectedMedical = detectMedicalFromKeywords(cleanedText);
  const detectedRates = extractRates(cleanedText);
  const wantsOnePager = detectOnePagerRequest(cleanedText);

  const contextInfo = previousContext
    ? `\nPREVIOUS CONTEXT:\n${JSON.stringify(previousContext, null, 2)}`
    : '';

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `You are a smart assistant extracting client info for a debt collection agency. Understand NATURAL LANGUAGE - users don't use strict formats.

MESSAGE:
${cleanedText}
${contextInfo}

PRE-DETECTED HINTS (use these):
- Company: ${detectedCompany.id} (${detectedCompany.name})
- Looks medical: ${detectedMedical}
- Rates found: ${JSON.stringify(detectedRates)}
- Wants one-pager: ${wantsOnePager}

Extract these fields (null if not found):
- company: "msb" or "vegasvalley" (look for Vegas, VV, Nevada = vegasvalley; otherwise msb)
- clientName: The client/prospect business name (NOT the collection agency)
- signerName: Contact person at client
- email: Client email
- address: Client address
- website: Client website URL
- rate: Standard rate as NUMBER (default 30 if not specified)
- legalRate: Legal/litigation rate as NUMBER (only if TWO rates given like "35% and 45%" or "35%/45%")
- hasLegalRate: true only if user specified TWO rates (e.g., "35% and 45%", "35%/45% with legal")
- isMedical: true if medical/healthcare industry detected
- isCommercial: true if the request says "commercial", "b2b", "B2B", or "business to business" (Avery uses the dedicated commercial template for these)
- wantsOnePager: true if user asked for "one pager", "1 pager", "one-pager", "overview"
- transcript: Background info, call notes, pain points - everything about their situation
- accountType: one of "Municipal", "Medical", "Commercial", "Education" (best fit: government/city/county/state = Municipal; healthcare/dental/clinic/hospital/patient = Medical; school/university/college/district = Education; any other business = Commercial)
- accountValue: SHORT display string of the estimated account value or volume if mentioned (e.g. "$300K aging AR", "$17,181", "$1K-$10K per account", "~$25K"); null if not mentioned
- accountValueUSD: a single NUMBER (no symbols) estimating the total/largest dollar value if determinable from the text, else null

RULES:
1. Clean asterisks/bullets from clientName
2. If user says "35% and 45%" or "35%/45%" → rate=35, legalRate=45, hasLegalRate=true
3. If only one rate like "35%" → rate=35, hasLegalRate=false
4. If no rate specified → rate=30 (default)
5. isMedical=true for: dental, chiro, clinic, hospital, patient, doctor, healthcare
6. wantsOnePager=true ONLY if they explicitly ask for it
7. accountType: default "Commercial" if unclear. If isMedical is true, accountType should be "Medical".
9. isCommercial=true ONLY if the words "commercial", "b2b", or "business to business" appear in the request.
8. accountValueUSD: parse ranges to the high end (e.g. "$1,000 to $10,000" -> 10000; "over 25k" -> 25000; "$300K" -> 300000)

Return ONLY valid JSON:
{
  "company": "msb" or "vegasvalley",
  "clientName": "string or null",
  "signerName": "string or null",
  "email": "string or null",
  "address": "string or null",
  "website": "string or null",
  "rate": number,
  "legalRate": number or null,
  "hasLegalRate": boolean,
  "isMedical": boolean,
  "isCommercial": boolean,
  "wantsOnePager": boolean,
  "transcript": "string or null",
  "accountType": "Municipal" | "Medical" | "Commercial" | "Education",
  "accountValue": "string or null",
  "accountValueUSD": number or null
}`
    }]
  });

  try {
    const jsonStr = response.content[0].text.trim();
    const match = jsonStr.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : jsonStr);

    // Additional cleanup
    if (parsed.clientName) {
      parsed.clientName = cleanClientName(parsed.clientName);
    }

    // Commercial/B2B detection - explicit keyword is authoritative
    parsed.isCommercial = !!parsed.isCommercial || /\b(commercial|b2b|b-2-b|business[ -]?to[ -]?business)\b/i.test(cleanedText);
    if (parsed.isCommercial) parsed.accountType = 'Commercial';

    // Get full company config
    parsed.companyConfig = parsed.company === 'vegasvalley' ? COMPANIES.vegasvalley : COMPANIES.msb;
    parsed.company = parsed.companyConfig;

    // Ensure rate has default
    if (!parsed.rate || parsed.rate === null) {
      parsed.rate = 30;
    }

    return parsed;
  } catch (e) {
    console.error('Failed to parse natural language:', e);
    return fallbackParse(cleanedText);
  }
}

// Detect if text contains medical keywords
function detectMedicalFromKeywords(text) {
  const lowerText = text.toLowerCase();
  return MEDICAL_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

// Extract rates from text
function extractRates(text) {
  const rates = [];

  // Look for patterns like "35%", "35% and 45%", "35%/45%"
  const ratePatterns = [
    /(\d+)%\s*(?:and|\/|,)\s*(\d+)%/i,  // "35% and 45%" or "35%/45%"
    /(\d+)%/g                            // Single rate
  ];

  // Check for dual rate first
  const dualMatch = text.match(/(\d+)%\s*(?:and|\/|,|with)\s*(\d+)%/i);
  if (dualMatch) {
    return {
      rate: parseInt(dualMatch[1]),
      legalRate: parseInt(dualMatch[2]),
      hasLegalRate: true
    };
  }

  // Check for single rate
  const singleMatch = text.match(/(\d+)%/);
  if (singleMatch) {
    return {
      rate: parseInt(singleMatch[1]),
      legalRate: null,
      hasLegalRate: false
    };
  }

  return { rate: 30, legalRate: null, hasLegalRate: false };
}

// Detect if user wants one-pager
function detectOnePagerRequest(text) {
  const lowerText = text.toLowerCase();
  const onePagerPatterns = [
    'one pager', '1 pager', 'one-pager', '1-pager',
    'onepager', 'overview', 'summary sheet', 'info sheet'
  ];
  return onePagerPatterns.some(p => lowerText.includes(p));
}

// Clean common input issues
function cleanInput(text) {
  return text
    .replace(/<@[A-Z0-9]+(\|[^>]+)?>/g, '') // Remove Slack mentions
    .replace(/<mailto:[^|]+\|([^>]+)>/g, '$1') // Clean mailto links
    .replace(/<(https?:\/\/[^|>]+)(\|[^>]+)?>/g, '$1') // Clean URLs
    .replace(/\*\*/g, '')
    .replace(/^[\s*•\-]+/gm, '')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

// Clean client name
function cleanClientName(name) {
  if (!name) return name;
  return name
    .replace(/^[\s*•\-"']+/, '')
    .replace(/[\s*•\-"']+$/, '')
    .replace(/\*+/g, '')
    .replace(/•/g, '')
    .trim();
}

// Fallback parser
function fallbackParse(text) {
  const companyResult = detectCompany(text);
  const detectedMedical = detectMedicalFromKeywords(text);
  const detectedRates = extractRates(text);
  const wantsOnePager = detectOnePagerRequest(text);

  const data = {
    company: companyResult,
    companyConfig: companyResult,
    clientName: null,
    signerName: null,
    email: null,
    address: null,
    website: null,
    rate: detectedRates.rate || 30,
    legalRate: detectedRates.legalRate,
    hasLegalRate: detectedRates.hasLegalRate || false,
    isMedical: detectedMedical,
    wantsOnePager: wantsOnePager,
    transcript: text
  };

  // Try to extract client name
  const clientPatterns = [
    /(?:contract for|client[:\s]+|new client[:\s]+|for\s+)([A-Z][A-Za-z0-9\s&,.']+?)(?:\.|,|\n|$)/i,
    /Client:\s*(.+?)(?:\n|$)/i
  ];

  for (const pattern of clientPatterns) {
    const match = text.match(pattern);
    if (match) {
      data.clientName = cleanClientName(match[1]);
      break;
    }
  }

  return data;
}

// Parse a change request in a thread
async function parseChangeRequest(anthropic, text, originalContext) {
  const minimalContext = {
    company: originalContext.company?.id || originalContext.companyConfig?.id || 'msb',
    clientName: originalContext.clientName,
    signerName: originalContext.signerName,
    email: originalContext.email,
    address: originalContext.address,
    website: originalContext.website,
    rate: originalContext.rate || 30,
    legalRate: originalContext.legalRate,
    hasLegalRate: originalContext.hasLegalRate || false,
    isMedical: originalContext.isMedical,
    isCommercial: originalContext.isCommercial,
    contractDate: originalContext.contractDate || null
  };

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Modify contract data based on user request.

CURRENT DATA:
${JSON.stringify(minimalContext, null, 2)}

USER REQUEST:
${text}

Apply changes. Examples:
- "change rate to 35%" → rate: 35
- "35% and 45%" → rate: 35, legalRate: 45, hasLegalRate: true
- "make it medical" → isMedical: true
- "non-medical" → isMedical: false
- "make it commercial" / "b2b" → isCommercial: true
- "change name to X" → clientName: X

Return ONLY valid JSON:
{
  "company": "msb" or "vegasvalley",
  "clientName": "...",
  "signerName": "...",
  "email": "...",
  "address": "...",
  "website": "...",
  "rate": number,
  "legalRate": number or null,
  "hasLegalRate": boolean,
  "isMedical": boolean,
  "isCommercial": boolean,
  "contractDate": "MM/DD/YYYY or null",
  "changesSummary": "what changed"
}`
    }]
  });

  try {
    const jsonStr = response.content[0].text.trim();
    const match = jsonStr.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : jsonStr);

    const merged = {
      ...originalContext,
      ...parsed,
      transcript: originalContext.transcript
    };

    // Commercial/B2B: honor an explicit switch in the change text; never
    // silently turn it off (keep whatever the original context had).
    if (/\b(commercial|b2b|b-2-b|business[ -]?to[ -]?business)\b/i.test(text)) {
      merged.isCommercial = true;
      merged.accountType = 'Commercial';
    } else {
      merged.isCommercial = !!merged.isCommercial;
    }

    if (merged.clientName) {
      merged.clientName = cleanClientName(merged.clientName);
    }

    merged.companyConfig = merged.company === 'vegasvalley' ? COMPANIES.vegasvalley : COMPANIES.msb;
    merged.company = merged.companyConfig;

    return merged;
  } catch (e) {
    console.error('Failed to parse change request:', e);
    return { ...originalContext, changesSummary: 'Could not parse changes' };
  }
}

module.exports = {
  parseNaturalLanguage,
  parseChangeRequest,
  cleanClientName,
  cleanInput,
  detectMedicalFromKeywords,
  extractRates,
  detectOnePagerRequest
};
