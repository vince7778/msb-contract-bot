/**
 * Email Generator
 * Creates personalized follow-up emails based on client data and transcript analysis
 */

const { COMPANIES } = require('./companyConfig');

async function generateEmail(anthropic, clientData) {
  // Get company info
  const company = clientData.company || COMPANIES.msb;
  const isVegas = company.id === 'vegasvalley';

  const companyDesc = isVegas
    ? `Vegas Valley Collection Service
- Nevada's trusted collection experts
- Full compliance (FDCPA${clientData.isMedical ? ', HIPAA' : ''}, state regulations)
- Performance-based (no collection, no fee)`
    : `Midwest Service Bureau, LLC (MSB)
- 55+ years in collections
- Full compliance (FDCPA${clientData.isMedical ? ', HIPAA' : ''}, state regulations)
- Performance-based (no collection, no fee)`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Write a professional follow-up email for a debt collection agency sales representative to send to a prospective client.

CLIENT INFO:
- Company: ${clientData.clientName}
- Contact: ${clientData.signerName || 'the decision maker'}
- Industry: ${clientData.isMedical ? 'Healthcare/Medical' : 'Commercial/Business'}
- Collection Rate Discussed: ${clientData.rate}%

PAIN POINTS IDENTIFIED:
${clientData.painPoints?.length > 0 ? clientData.painPoints.map(p => `- ${p}`).join('\n') : '- General A/R challenges'}

THEIR CONCERNS:
${clientData.concerns?.length > 0 ? clientData.concerns.map(c => `- ${c}`).join('\n') : '- Standard collection concerns'}

FROM: ${companyDesc}

Write a SHORT, professional email that:
1. References our recent conversation
2. Addresses 1-2 of their specific concerns
3. Mentions the attached contract and one-pager
4. Has a clear call-to-action (schedule a follow-up call or sign and return)
5. Is warm but professional

Keep it under 150 words. Do NOT include subject line - just the email body.
Start with "Hi [First Name]," using their actual name if provided.
Sign off as the ${company.shortName} team.

Email body only:`
    }]
  });

  let emailText = response.content[0].text.trim();

  // Replace placeholder name if we have the signer name
  if (clientData.signerName) {
    const firstName = clientData.signerName.split(' ')[0];
    emailText = emailText.replace(/\[First Name\]/g, firstName);
    emailText = emailText.replace(/Hi there,/g, `Hi ${firstName},`);
  }

  return emailText;
}

module.exports = { generateEmail };
