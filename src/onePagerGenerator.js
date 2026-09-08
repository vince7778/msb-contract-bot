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
  AlignmentType, BorderStyle, WidthType, ShadingType, ImageRun, ExternalHyperlink,
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

  // A one-pager must never spill onto a second page. Real AI output sits
  // well inside these limits; this is a defensive clamp for outliers.
  const doc = createStunningOnePager(clientData, company, clampContent(aiContent));
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

/**
 * Trim content to lengths that are guaranteed to fit on one page.
 * Cuts on a word boundary so copy never ends mid-word.
 */

/**
 * Read intrinsic pixel dimensions from a PNG (IHDR chunk) so logos are
 * never stretched out of their true aspect ratio.
 */
function pngSize(buf) {
  try {
    if (!buf || buf.length < 24) return null;
    if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47)) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } catch (e) {
    return null;
  }
}

function clampContent(c) {
  const cut = (text, max) => {
    const t = `${text || ''}`.trim();
    if (t.length <= max) return t;
    const slice = t.slice(0, max);
    const lastSpace = slice.lastIndexOf(' ');
    return (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).replace(/[,;:\-\s]+$/, '') + '\u2026';
  };
  const pts = (arr, max, keep) => (Array.isArray(arr) ? arr : []).slice(0, keep).map(p => cut(p, max));

  return {
    headline: cut(c.headline, 110),
    personalIntro: cut(c.personalIntro, 540),
    theirProblem: {
      title: cut(c.theirProblem && c.theirProblem.title, 46),
      points: pts(c.theirProblem && c.theirProblem.points, 250, 3)
    },
    ourSolution: {
      title: cut(c.ourSolution && c.ourSolution.title, 46),
      points: pts(c.ourSolution && c.ourSolution.points, 250, 3)
    },
    whyUs: {
      title: cut(c.whyUs && c.whyUs.title, 46),
      points: pts(c.whyUs && c.whyUs.points, 175, 4)
    },
    callToAction: cut(c.callToAction, 230),
    closingNote: cut(c.closingNote, 130)
  };
}

function createStunningOnePager(clientData, company, content) {
  const isVegas = company.id === 'vegasvalley';

  // ---------------------------------------------------------------
  // Restrained, professional palette: deep neutrals + ONE brand
  // accent. (The old design stacked purple + green + orange, which
  // read as cheap on a client-facing document.)
  // ---------------------------------------------------------------
  const INK    = '1B2432';  // headings
  const BODY   = '3A4453';  // body copy
  const MUTED  = '6E7889';  // secondary / captions
  const ACCENT = (company.colors && company.colors.primary) || (isVegas ? '1A3A6B' : '5B2A78');
  const RULE   = 'D4D9E0';  // hairlines
  const TINT   = 'F5F6F8';  // subtle fill
  const WHITE  = 'FFFFFF';

  // ---------------------------------------------------------------
  // Adaptive density: keep the roomy, well-spaced look for typical
  // content, and automatically tighten for unusually long copy so a
  // "one-pager" is never two pages.
  // ---------------------------------------------------------------
  const weight = [
    content.headline, content.personalIntro, content.callToAction,
    ...(content.theirProblem.points || []), ...(content.ourSolution.points || []),
    ...(content.whyUs.points || [])
  ].join(' ').length;
  const tight = weight > 2450;   // typical content (~1950) stays roomy
  const S = (roomy, compact) => (tight ? compact : roomy);

  const CW = 10840;               // content width (US Letter, 0.49" margins)
  const HALF = Math.floor(CW / 2);
  const QUARTER = Math.floor(CW / 4);

  // Use the real brand logo when one is present in /assets.
  // If none exists we fall back to a clean typographic wordmark —
  // far better than a fake generated logo block.
  const logoPath = path.join(__dirname, '..', 'assets', isVegas ? 'vegas-logo.png' : 'msb-logo.png');
  let logoRun = null;
  let logoAspect = 0;   // width / height
  if (fs.existsSync(logoPath)) {
    try {
      const data = fs.readFileSync(logoPath);
      const dim = pngSize(data);
      // Preserve the real aspect ratio - never stretch the brand mark.
      let w, h;
      if (dim) {
        logoAspect = dim.width / dim.height;
        if (logoAspect >= 3) {          // wide banner logo
          w = Math.min(232, 60 * logoAspect); h = w / logoAspect;
        } else {                         // square / tall monogram
          h = 64; w = h * logoAspect;   // monogram: a touch larger for presence
        }
      } else {
        w = 190; h = 52;                 // unknown format - safe default
      }
      logoRun = new ImageRun({
        type: 'png',
        data,
        transformation: { width: Math.round(w), height: Math.round(h) },
        altText: { title: company.shortName, description: `${company.shortName} logo` }
      });
    } catch (e) {
      console.log('[OnePager] Could not load logo:', e.message);
    }
  }

  const hair = { style: BorderStyle.SINGLE, size: 4, color: RULE };
  const none = { style: BorderStyle.NONE, size: 0, color: WHITE };
  const cellBorders = { top: hair, left: hair, bottom: hair, right: hair };

  const children = [];

  // ================= HEADER =================
  const wordmarkPara = new Paragraph({
    spacing: { after: 20 },
    children: [new TextRun({ text: company.shortName.toUpperCase(), bold: true, size: 26, color: ACCENT, characterSpacing: 30 })]
  });
  const taglinePara = new Paragraph({
    children: [new TextRun({ text: company.tagline, size: 13, color: MUTED, characterSpacing: 24 })]
  });
  const noB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

  let brandCell;
  if (logoRun && logoAspect && logoAspect < 3) {
    // Square/monogram mark: lock it up beside the company name.
    brandCell = [new Table({
      width: { size: HALF, type: WidthType.DXA },
      columnWidths: [1250, HALF - 1250],
      rows: [new TableRow({ children: [
        new TableCell({
          width: { size: 1250, type: WidthType.DXA },
          borders: { top: noB, left: noB, bottom: noB, right: noB },
          margins: { top: 0, bottom: 0, left: 0, right: 150 },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ children: [logoRun] })]
        }),
        new TableCell({
          width: { size: HALF - 1250, type: WidthType.DXA },
          borders: { top: noB, left: noB, bottom: noB, right: noB },
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          verticalAlign: VerticalAlign.CENTER,
          children: [wordmarkPara, taglinePara]
        })
      ]})]
    })];
  } else if (logoRun) {
    // Wide banner logo already contains the company name, so the wordmark
    // is never repeated. The tagline is only printed when the logo itself
    // doesn't already include it (see logoHasTagline in companyConfig).
    brandCell = [new Paragraph({ spacing: { after: company.logoHasTagline ? 0 : 60 }, children: [logoRun] })];
    if (!company.logoHasTagline) brandCell.push(taglinePara);
  } else {
    brandCell = [wordmarkPara, taglinePara];
  }

  children.push(new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [HALF, CW - HALF],
    rows: [new TableRow({ children: [
      new TableCell({
        width: { size: HALF, type: WidthType.DXA },
        borders: { top: none, left: none, bottom: none, right: none },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        verticalAlign: VerticalAlign.CENTER,
        children: brandCell
      }),
      new TableCell({
        width: { size: CW - HALF, type: WidthType.DXA },
        borders: { top: none, left: none, bottom: none, right: none },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 20 },
            children: [new TextRun({ text: 'PREPARED FOR', size: 13, color: MUTED, characterSpacing: 30 })] }),
          new Paragraph({ alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: clientData.clientName || 'Valued Client', bold: true, size: 24, color: INK })] })
        ]
      })
    ]})]
  }));

  // accent rule under the header
  children.push(new Paragraph({
    spacing: { before: 140, after: 0 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 1 } },
    children: [new TextRun({ text: '', size: 2 })]
  }));

  // ================= HEADLINE =================
  children.push(new Paragraph({
    spacing: { before: S(420, 250), after: S(180, 120), line: 320 },
    children: [new TextRun({ text: content.headline, bold: true, size: S(34, 30), color: INK })]
  }));

  // ================= INTRO =================
  children.push(new Paragraph({
    spacing: { after: S(400, 250), line: S(330, 300) },
    children: [new TextRun({ text: content.personalIntro, size: S(22, 20), color: BODY })]
  }));

  // ================= CHALLENGE / SOLUTION =================
  children.push(new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [HALF, CW - HALF],
    rows: [
      new TableRow({ children: [
        sectionHeaderCell(content.theirProblem.title, HALF, TINT, INK, ACCENT),
        sectionHeaderCell(content.ourSolution.title, CW - HALF, TINT, INK, ACCENT)
      ]}),
      new TableRow({ children: [
        bulletCell(content.theirProblem.points, HALF, MUTED, BODY, cellBorders, tight),
        bulletCell(content.ourSolution.points, CW - HALF, ACCENT, BODY, cellBorders, tight)
      ]})
    ]
  }));

  // ================= WHY US =================
  children.push(new Paragraph({
    spacing: { before: S(480, 300), after: 40 },
    children: [new TextRun({ text: content.whyUs.title.toUpperCase(), bold: true, size: 18, color: ACCENT, characterSpacing: 30 })]
  }));
  children.push(new Paragraph({
    spacing: { after: S(220, 150) },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 1 } },
    children: [new TextRun({ text: '', size: 2 })]
  }));

  const pts = (content.whyUs.points || []).slice(0, 4);
  while (pts.length < 4) pts.push('');
  children.push(new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [QUARTER, QUARTER, QUARTER, CW - QUARTER * 3],
    rows: [new TableRow({ children: pts.map((t, i) =>
      pillarCell(t, i === 3 ? CW - QUARTER * 3 : QUARTER, ACCENT, BODY, MUTED, tight)
    )})]
  }));

  // ================= CALL TO ACTION =================
  children.push(spacer(S(500, 280)));
  children.push(new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [CW],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: CW, type: WidthType.DXA },
      shading: { fill: ACCENT, type: ShadingType.CLEAR },
      borders: { top: none, left: none, bottom: none, right: none },
      margins: { top: S(220, 150), bottom: S(220, 150), left: 300, right: 300 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: 300 },
        children: [new TextRun({ text: content.callToAction, bold: true, size: S(22, 20), color: WHITE })]
      })]
    })]})]
  }));

  // ================= FOOTER =================
  children.push(new Paragraph({
    spacing: { before: S(460, 260), after: S(140, 100) },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 1 } },
    children: [new TextRun({ text: '', size: 2 })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${company.phone}     `, size: 17, color: BODY }),
      // clickable in the PDF, and shows the full https:// address
      new ExternalHyperlink({
        link: company.website,
        children: [new TextRun({ text: company.website, size: 17, color: ACCENT })]
      }),
      new TextRun({ text: `     ${company.address}`, size: 17, color: BODY })
    ]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: content.closingNote, size: 16, color: MUTED, italics: true })]
  }));

  return new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 21, color: BODY } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },   // US Letter
          margin: { top: 700, right: 700, bottom: 640, left: 700 }
        }
      },
      children
    }]
  });
}

// ========== HELPER FUNCTIONS ==========

function spacer(twips) {
  return new Paragraph({ spacing: { after: twips }, children: [new TextRun({ text: '', size: 2 })] });
}

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return { top: none, left: none, bottom: none, right: none };
}

// Muted section header with a single accent underline (replaces the old
// saturated purple/green blocks).
function sectionHeaderCell(text, width, fill, textColor, accent) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill, type: ShadingType.CLEAR },
    margins: { top: 110, bottom: 110, left: 170, right: 150 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'D4D9E0' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'D4D9E0' },
      bottom: { style: BorderStyle.SINGLE, size: 12, color: accent },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'D4D9E0' }
    },
    children: [new Paragraph({ children: [
      new TextRun({ text: text, bold: true, size: 20, color: textColor })
    ]})]
  });
}

// Clean dash bullets in a single tone - no red/green dot noise.
function bulletCell(points, width, bulletColor, textColor, borders, tight) {
  const S = (r, c) => (tight ? c : r);
  const paragraphs = (points || []).map((point, i) => new Paragraph({
    spacing: { before: i === 0 ? 0 : S(120, 80), after: 0, line: S(290, 265) },
    indent: { left: 200, hanging: 200 },
    children: [
      new TextRun({ text: '\u2014  ', bold: true, color: bulletColor, size: S(20, 18) }),
      new TextRun({ text: point, size: S(20, 18), color: textColor })
    ]
  }));
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    margins: { top: S(190, 130), bottom: S(210, 140), left: 180, right: 160 },
    children: paragraphs.length ? paragraphs : [new Paragraph({ children: [new TextRun({ text: '' })] })]
  });
}

// "Why us" pillar: thin accent rule on top, no cheap checkmark icons.
function pillarCell(text, width, accent, textColor, muted, tight) {
  const S = (r, c) => (tight ? c : r);
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 12, color: accent },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
    },
    margins: { top: S(180, 130), bottom: S(140, 80), left: 90, right: 130 },
    verticalAlign: VerticalAlign.TOP,
    children: [new Paragraph({
      spacing: { line: S(280, 255) },
      children: [new TextRun({ text: text, size: S(17, 16), color: textColor })]
    })]
  });
}

module.exports = { generateOnePager };
