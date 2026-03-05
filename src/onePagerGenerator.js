/**
 * One-Pager Generator - AI-Driven Creative Design
 * Creates personalized, visually striking one-pagers
 *
 * RULES:
 * - NO FAKE STATS - factual information only
 * - AI thinks creatively about content and layout
 * - Uses company branding (colors, logo)
 * - Personalized to client's specific situation
 */

const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, ImageRun,
  HeightRule, VerticalAlign, convertInchesToTwip } = require('docx');
const { COMPANIES } = require('./companyConfig');
const fs = require('fs');
const path = require('path');

// Sales reps
const SALES_REPS = {
  avery: { name: 'Avery Hotchkiss', email: 'ahotchkiss@msbureau.com', phone: '(316) 267-8300' },
  vince: { name: 'Vince Esgana', email: 'vince@msbureau.com', phone: '(316) 267-8300' },
  default: { name: 'Our Team', email: 'info@msbureau.com', phone: '(316) 267-8300' }
};

async function generateOnePager(anthropic, clientData) {
  const company = clientData.company || clientData.companyConfig || COMPANIES.msb;

  // Generate AI-driven personalized content
  const aiContent = await generateAIContent(anthropic, clientData, company);

  // Create the beautifully designed document
  const doc = createStunningOnePager(clientData, company, aiContent);
  const buffer = await Packer.toBuffer(doc);

  return { buffer };
}

/**
 * AI generates personalized, creative content based on actual client data
 * NO fake stats - everything is derived from real information
 */
async function generateAIContent(anthropic, clientData, company) {
  const clientName = clientData.clientName || 'your business';
  const signerName = clientData.signerName || '';
  const firstName = signerName.split(' ')[0] || '';
  const transcript = clientData.transcript || '';
  const rate = clientData.rate || company.defaultRate || 30;
  const legalRate = clientData.litigationRate || (rate + 10);
  const isMedical = clientData.isMedical;
  const isVegas = company.id === 'vegasvalley';

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are creating a one-pager for a collections company to send to a potential client.

CLIENT INFO:
- Business Name: ${clientName}
- Contact Person: ${signerName}
- Industry: ${isMedical ? 'Medical/Healthcare' : 'Commercial/Non-Medical'}
- Collection Rate: ${rate}%${clientData.includeLitigation ? ` (${legalRate}% with legal action)` : ''}
- Notes/Transcript: ${transcript.substring(0, 2000)}

COLLECTION COMPANY:
- Name: ${company.name}
- Short Name: ${company.shortName}
- Tagline: ${company.tagline}
- Coverage: ${isVegas ? 'Nevada-based, serving Nevada businesses' : 'Nationwide service since 1970'}

YOUR TASK: Create compelling, FACTUAL content for a one-pager. Return JSON with:

{
  "headline": "A powerful 8-12 word headline that speaks directly to their pain (recovering money, stopping losses, etc.)",

  "personalIntro": "A 2-3 sentence intro addressing ${firstName || 'the business owner'} directly. Reference their specific industry/situation if known from the transcript. Be empathetic about their collections challenges.",

  "theirProblem": {
    "title": "Short title for their challenge section (4-6 words)",
    "points": ["3 specific challenges they face based on their industry - be concrete and relatable, not generic"]
  },

  "ourSolution": {
    "title": "Short title for solution section (4-6 words)",
    "points": ["3 matching solutions - explain HOW we solve each problem above. Be specific about our approach."]
  },

  "whyUs": {
    "title": "Why ${company.shortName}? (or similar)",
    "points": ["4 key differentiators - FACTUAL only: ${isVegas ? 'Nevada expertise, local presence' : '55+ years experience, nationwide reach'}, performance-based fees (${rate}%), legal resources, compliance expertise"]
  },

  "callToAction": "A compelling 1-sentence call to action - create urgency without being pushy",

  "closingNote": "A brief, warm closing note (1 sentence) that reinforces partnership"
}

CRITICAL RULES:
- NO FAKE STATISTICS (don't invent recovery rates, client counts, or percentages)
- Be specific to their industry when possible
- Sound professional but warm, not salesy
- Focus on THEIR benefits, not our features
- If you don't know something from the transcript, keep it general but relevant

Return ONLY valid JSON, no markdown or explanation.`
      }]
    });

    const text = response.content[0].text.trim();
    // Try to parse, cleaning up common issues
    let cleanText = text;
    if (text.startsWith('```')) {
      cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    }
    return JSON.parse(cleanText);
  } catch (e) {
    console.error('AI content generation failed:', e.message);
    // Fallback to intelligent defaults
    return getSmartFallback(clientData, company);
  }
}

/**
 * Smart fallback content when AI fails
 */
function getSmartFallback(clientData, company) {
  const isMedical = clientData.isMedical;
  const isVegas = company.id === 'vegasvalley';
  const rate = clientData.rate || company.defaultRate || 30;
  const firstName = (clientData.signerName || '').split(' ')[0];

  return {
    headline: isMedical
      ? "Stop Chasing Payments. Start Focusing on Patient Care."
      : "Recover What You've Earned. We Handle the Rest.",

    personalIntro: firstName
      ? `${firstName}, we understand that unpaid accounts drain your time, energy, and resources. You've delivered excellent ${isMedical ? 'care' : 'service'} — now let us help you get paid for it.`
      : `Unpaid accounts drain your time, energy, and resources. You've delivered excellent ${isMedical ? 'care' : 'service'} — now let us help you get paid for it.`,

    theirProblem: {
      title: "The Challenge You're Facing",
      points: isMedical ? [
        "Patients received care but balances remain unpaid — aging AR keeps growing",
        "Your staff spends valuable time on collection calls instead of patient care",
        "Concerns about maintaining patient relationships while pursuing payment"
      ] : [
        "Clients received your products/services but invoices remain unpaid",
        "Your team wastes hours chasing payments instead of growing the business",
        "Worry that debtors may disappear or close before you can recover"
      ]
    },

    ourSolution: {
      title: "How We Solve This",
      points: [
        "We take over all debtor communication — professional, compliant, and persistent",
        "Our proven approach motivates payment while protecting your reputation",
        "You only pay when we collect — zero risk, maximum recovery"
      ]
    },

    whyUs: {
      title: `Why ${company.shortName}?`,
      points: isVegas ? [
        "Nevada-based experts who understand local business dynamics",
        `Performance-based ${rate}% fee — you pay nothing unless we collect`,
        "Full legal resources when standard collection isn't enough",
        "Complete FDCPA, FCRA, and state compliance — protecting you always"
      ] : [
        "55+ years of collection expertise serving businesses nationwide",
        `Performance-based ${rate}% fee — you pay nothing unless we collect`,
        "Full legal resources including judgment enforcement when needed",
        "Complete FDCPA, FCRA, and state compliance — protecting you always"
      ]
    },

    callToAction: "Let's discuss how we can start recovering your outstanding balances this week.",

    closingNote: "We're here to be your trusted partner in getting paid what you've earned."
  };
}

/**
 * Creates a visually stunning one-pager document
 */
function createStunningOnePager(clientData, company, content) {
  const isVegas = company.id === 'vegasvalley';
  const rate = clientData.rate || company.defaultRate || 30;

  // Brand colors
  const PRIMARY = company.colors?.primary || (isVegas ? '1A1A2E' : '6B2D8B');
  const SECONDARY = company.colors?.secondary || (isVegas ? '333333' : '2E7D32');
  const ACCENT = company.colors?.accent || (isVegas ? '0066CC' : 'FF6B35');
  const LIGHT_BG = 'F8F9FA';
  const WHITE = 'FFFFFF';

  // Try to load company logo
  const logoPath = path.join(__dirname, '..', 'assets', isVegas ? 'vegas-logo.png' : 'msb-logo.png');
  let logoRun = null;

  if (fs.existsSync(logoPath)) {
    try {
      logoRun = new ImageRun({
        type: 'png',
        data: fs.readFileSync(logoPath),
        transformation: { width: 180, height: 50 },
        altText: { title: company.shortName, description: `${company.shortName} Logo` }
      });
    } catch (e) {
      console.log('Could not load logo:', e.message);
    }
  }

  const children = [];

  // ========== HEADER SECTION ==========
  const headerRow = new TableRow({
    height: { value: convertInchesToTwip(0.8), rule: HeightRule.ATLEAST },
    children: [
      // Logo/Company Name (left)
      new TableCell({
        borders: noBorders(),
        width: { size: 50, type: WidthType.PERCENTAGE },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          logoRun
            ? new Paragraph({ children: [logoRun] })
            : new Paragraph({
                children: [
                  new TextRun({ text: company.shortName, bold: true, size: 28, color: PRIMARY }),
                ]
              }),
          new Paragraph({
            children: [
              new TextRun({ text: company.tagline, size: 16, color: '666666', italics: true })
            ]
          })
        ]
      }),
      // Client Name (right)
      new TableCell({
        borders: noBorders(),
        width: { size: 50, type: WidthType.PERCENTAGE },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: 'PREPARED FOR', size: 14, color: '999999' })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: clientData.clientName || 'Valued Client', bold: true, size: 24, color: PRIMARY })
            ]
          })
        ]
      })
    ]
  });

  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow] }));
  children.push(spacer(150));

  // ========== HEADLINE BANNER ==========
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    shading: { fill: PRIMARY, type: ShadingType.CLEAR },
    spacing: { before: 100, after: 100 },
    children: [
      new TextRun({ text: '  ', size: 28 }), // padding
      new TextRun({ text: content.headline, bold: true, size: 28, color: WHITE }),
      new TextRun({ text: '  ', size: 28 })
    ]
  }));
  children.push(spacer(200));

  // ========== PERSONAL INTRO ==========
  children.push(new Paragraph({
    shading: { fill: LIGHT_BG, type: ShadingType.CLEAR },
    spacing: { before: 80, after: 80 },
    children: [
      new TextRun({ text: '  ' }),
      new TextRun({ text: content.personalIntro, size: 22 }),
      new TextRun({ text: '  ' })
    ]
  }));
  children.push(spacer(200));

  // ========== PROBLEM / SOLUTION TWO-COLUMN ==========
  const problemSolutionTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [4800, 4800],
    rows: [
      // Headers
      new TableRow({
        children: [
          createColoredHeaderCell(content.theirProblem.title, PRIMARY, WHITE),
          createColoredHeaderCell(content.ourSolution.title, SECONDARY, WHITE)
        ]
      }),
      // Content
      new TableRow({
        children: [
          createBulletListCell(content.theirProblem.points, 'E74C3C'), // Red bullets for problems
          createBulletListCell(content.ourSolution.points, SECONDARY) // Green bullets for solutions
        ]
      })
    ]
  });
  children.push(problemSolutionTable);
  children.push(spacer(250));

  // ========== WHY US SECTION ==========
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 150 },
    children: [
      new TextRun({ text: content.whyUs.title, bold: true, size: 26, color: PRIMARY })
    ]
  }));

  // Four benefit boxes in a row
  const benefitBoxes = content.whyUs.points.map((point, i) => {
    const icons = ['✓', '✓', '✓', '✓'];
    return createBenefitBox(icons[i], point, PRIMARY, ACCENT);
  });

  const benefitTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: benefitBoxes })]
  });
  children.push(benefitTable);
  children.push(spacer(250));

  // ========== CALL TO ACTION ==========
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    shading: { fill: ACCENT, type: ShadingType.CLEAR },
    spacing: { before: 100, after: 100 },
    children: [
      new TextRun({ text: '  ', size: 24 }),
      new TextRun({ text: content.callToAction, bold: true, size: 24, color: WHITE }),
      new TextRun({ text: '  ', size: 24 })
    ]
  }));
  children.push(spacer(150));

  // ========== CONTACT FOOTER ==========
  const contactInfo = [
    `📞 ${company.phone}`,
    `🌐 ${company.website}`,
    `📍 ${company.address}`
  ].join('  |  ');

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: contactInfo, size: 18, color: '666666' })
    ]
  }));
  children.push(spacer(80));

  // Closing note
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: content.closingNote, size: 18, color: '888888', italics: true })
    ]
  }));

  return new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 500, right: 600, bottom: 500, left: 600 }
        }
      },
      children
    }]
  });
}

// ========== HELPER FUNCTIONS ==========

function spacer(twips) {
  return new Paragraph({ spacing: { after: twips } });
}

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return { top: none, bottom: none, left: none, right: none };
}

function createColoredHeaderCell(text, bgColor, textColor) {
  return new TableCell({
    shading: { fill: bgColor, type: ShadingType.CLEAR },
    margins: { top: 100, bottom: 100, left: 150, right: 150 },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: text, bold: true, size: 22, color: textColor })]
      })
    ]
  });
}

function createBulletListCell(points, bulletColor) {
  const paragraphs = points.map(point =>
    new Paragraph({
      spacing: { before: 80, after: 80 },
      children: [
        new TextRun({ text: '● ', bold: true, color: bulletColor, size: 20 }),
        new TextRun({ text: point, size: 19 })
      ]
    })
  );

  return new TableCell({
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' }
    },
    margins: { top: 100, bottom: 100, left: 150, right: 150 },
    children: paragraphs
  });
}

function createBenefitBox(icon, text, primaryColor, accentColor) {
  return new TableCell({
    borders: {
      top: { style: BorderStyle.SINGLE, size: 8, color: accentColor },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'EEEEEE' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'EEEEEE' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'EEEEEE' }
    },
    shading: { fill: 'FAFAFA', type: ShadingType.CLEAR },
    width: { size: 25, type: WidthType.PERCENTAGE },
    margins: { top: 120, bottom: 120, left: 80, right: 80 },
    verticalAlign: VerticalAlign.TOP,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: icon, bold: true, size: 28, color: accentColor })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: text, size: 17 })]
      })
    ]
  });
}

module.exports = { generateOnePager };
