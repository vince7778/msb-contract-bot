/**
 * Transcript Analyzer
 * Uses Claude to analyze call transcripts and extract key information
 */

async function analyzeTranscript(anthropic, transcript) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Analyze this sales call transcript/notes and extract key information. Return ONLY valid JSON.

TRANSCRIPT:
"""
${transcript}
"""

Analyze and return this JSON structure:
{
  "isMedical": true/false (is this a healthcare/medical client? Look for: hospital, clinic, medical center, healthcare, patients, HIPAA, doctors, physicians, medical billing, etc.),
  "painPoints": ["list", "of", "3-5", "specific", "pain", "points", "they", "mentioned"],
  "concerns": ["list", "of", "their", "concerns", "about", "collections"],
  "opportunities": ["list", "of", "selling", "points", "that", "would", "resonate"],
  "companyType": "brief description of their business type",
  "urgency": "low/medium/high - how urgent is their need?",
  "keyQuotes": ["any", "notable", "quotes", "from", "the", "conversation"]
}

Focus on:
- Detecting if this is a medical/healthcare organization
- Identifying their specific collection challenges
- Finding opportunities to address their concerns
- Understanding their business type

Return JSON only, no other text:`
    }]
  });

  try {
    const jsonStr = response.content[0].text.trim();
    // Extract JSON if wrapped in markdown
    const match = jsonStr.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : jsonStr);

    return {
      isMedical: parsed.isMedical || false,
      painPoints: parsed.painPoints || [],
      concerns: parsed.concerns || [],
      opportunities: parsed.opportunities || [],
      companyType: parsed.companyType || 'Business',
      urgency: parsed.urgency || 'medium',
      keyQuotes: parsed.keyQuotes || []
    };
  } catch (e) {
    console.error('Failed to parse transcript analysis:', e);
    // Default analysis with keyword detection
    const lowerTranscript = transcript.toLowerCase();
    const medicalKeywords = ['medical', 'healthcare', 'hospital', 'clinic', 'patient', 'hipaa', 'doctor', 'physician', 'health'];
    const isMedical = medicalKeywords.some(k => lowerTranscript.includes(k));

    return {
      isMedical,
      painPoints: ['Aging accounts receivable', 'Staff time spent on collections', 'Cash flow concerns'],
      concerns: ['Compliance', 'Patient/customer relationships', 'Recovery rates'],
      opportunities: ['Professional collection services', 'Compliance expertise', 'Improved cash flow'],
      companyType: isMedical ? 'Healthcare Provider' : 'Business',
      urgency: 'medium',
      keyQuotes: []
    };
  }
}

module.exports = { analyzeTranscript };
