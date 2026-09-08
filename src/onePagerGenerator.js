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

YOUR TASK: Write a one-pager the prospect can hand to a decision-maker. It must answer
their questions, explain our services, and make the case for why we are the right agency
FOR THEM specifically. Mine the transcript hard - pull out real figures, aging, account
counts, industry details, objections they raised, and what they said they need. Reference
those specifics; generic marketing copy is a failure.

Use **double asterisks** to bold the few most important facts inside bullets (dollar
amounts, aging, key capabilities). Bold 1-2 phrases per bullet at most.

Return JSON with:

{
  "headline": "A sharp 8-14 word headline naming the outcome they want, in their language",

  "personalIntro": "3-4 sentences to ${firstName || 'the decision maker'}. Name their business model/industry, the specific situation from the transcript, and the tension they care about (money AND relationships/reputation/time). End on the no-risk point: they pay nothing unless we collect.",

  "theirProblem": {
    "title": "WHAT YOU'RE DEALING WITH",
    "points": ["3 bullets grounded in the transcript. Lead with their real numbers/aging where known (bold them). Name the operational cost and the relationship/reputation risk, not just 'unpaid invoices'."]
  },

  "ourSolution": {
    "title": "HOW WE HANDLE IT",
    "points": ["3 bullets that map 1:1 to the problems above. Explain the actual mechanics - dedicated team, skip tracing, escalation path, documentation handling, compliance - so it reads as a real process, not a promise."]
  },

  "whyUs": {
    "title": "Why ${company.shortName}?",
    "points": ["4 SHORT credibility pillars (max ~12 words each). FACTUAL only: ${isVegas ? 'Nevada-licensed, NRS 649 built, all 17 counties' : '55+ years since 1970, nationwide, licensed & bonded'}, 100% contingency, industry fit for their sector, legal/skip-trace capability."]
  },

  "whatWeNeed": ["4 SHORT items (3-6 words each) we need to start, tailored to their sector - e.g. billing history & current balance, any payment history, contact history / updated info, proof of debt or signed agreements"],

  "onboarding": "2 sentences: how placement actually works (submit manually or connect by integration, track status and recovered amounts in real time) and one reassurance that fits their situation from the transcript (e.g. missing signed agreements are still workable).",

  "callToAction": "1 sentence telling them exactly what to send us and what they get back, with no cost to look",

  "closingNote": "A short partnership line, e.g. a long-term recovery partner - not a one-time vendor"
}

CRITICAL RULES:
- NO FAKE STATISTICS. Never invent recovery rates, client counts, or percentages.
- Use ONLY figures the transcript actually contains. If the transcript gives a balance,
  aging, or account count, USE IT - that specificity is the whole point.
- Do NOT state a contingency percentage anywhere. Pricing is described only as
  performance-based and flexible with volume (handled separately in the layout).
- Sound like a specialist who listened to the call, not a brochure.
- If the transcript is thin, stay concrete about their INDUSTRY rather than inventing details.

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

    whatWeNeed: isMedical
      ? ['Billing history & current balance', 'Any payment history', 'Patient contact information', 'Itemized statements or EOBs']
      : ['Billing history & current balance', 'Any payment history', 'Contact history / updated info', 'Proof of debt or signed agreements'],

    onboarding: 'Submit accounts manually or connect directly to your system, then track status, activity, and recovered amounts in real time. Missing paperwork on a few accounts? We can usually still work them.',

    callToAction: "Send us your aging file and we'll show you exactly what's recoverable — at no cost to look.",

    closingNote: 'A long-term recovery partner — not a one-time vendor.'
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

/**
 * Turn "plain **bold** plain" into TextRuns so the AI can emphasise the
 * facts that matter (dollar figures, aging, key capabilities).
 */

// Small labelled panel used for "What we need" / "Onboarding".
function infoCell(label, bodyParagraphs, width, accent, muted, rule, tight) {
  const S = (r, c) => (tight ? c : r);
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: rule },
      left: { style: BorderStyle.SINGLE, size: 4, color: rule },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: rule },
      right: { style: BorderStyle.SINGLE, size: 4, color: rule }
    },
    margins: { top: S(150, 110), bottom: S(150, 115), left: 190, right: 170 },
    children: [
      new Paragraph({
        spacing: { after: 0 },
        children: [new TextRun({ text: label, bold: true, size: 15, color: muted, characterSpacing: 26 })]
      }),
      ...bodyParagraphs
    ]
  });
}

function richRuns(text, { size, color, boldColor, forceBold }) {
  const out = [];
  const parts = `${text || ''}`.split(/\*\*/);
  parts.forEach((part, i) => {
    if (!part) return;
    const isBold = forceBold || i % 2 === 1;
    out.push(new TextRun({
      text: part,
      size,
      bold: isBold,
      color: (i % 2 === 1) ? (boldColor || color) : color
    }));
  });
  return out.length ? out : [new TextRun({ text: '', size })];
}

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
    let t = `${text || ''}`.trim();
    if (t.length > max) {
      const slice = t.slice(0, max);
      const lastSpace = slice.lastIndexOf(' ');
      t = (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).replace(/[,;:\-\s]+$/, '') + '\u2026';
    }
    // never leave an unclosed **bold** marker behind
    if (((t.match(/\*\*/g) || []).length % 2) === 1) t = t.replace(/\*\*(?![\s\S]*\*\*)/, '');
    return t;
  };
  const pts = (arr, max, keep) => (Array.isArray(arr) ? arr : []).slice(0, keep).map(p => cut(p, max));
  // these render as plain text, so any bold markers must be removed
  const plain = (t) => `${t || ''}`.replace(/\*\*/g, '');

  return {
    headline: plain(cut(c.headline, 110)),
    personalIntro: cut(c.personalIntro, 470),
    theirProblem: {
      title: plain(cut(c.theirProblem && c.theirProblem.title, 46)),
      points: pts(c.theirProblem && c.theirProblem.points, 215, 3)
    },
    ourSolution: {
      title: plain(cut(c.ourSolution && c.ourSolution.title, 46)),
      points: pts(c.ourSolution && c.ourSolution.points, 215, 3)
    },
    whyUs: {
      title: plain(cut(c.whyUs && c.whyUs.title, 46)),
      points: pts(c.whyUs && c.whyUs.points, 95, 4).map(plain)
    },
    whatWeNeed: pts(c.whatWeNeed, 42, 4).map(plain),
    onboarding: cut(c.onboarding, 260),
    callToAction: cut(c.callToAction, 190),
    closingNote: plain(cut(c.closingNote, 90))
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
    content.headline, content.personalIntro, content.callToAction, content.onboarding,
    ...(content.theirProblem.points || []), ...(content.ourSolution.points || []),
    ...(content.whyUs.points || []), ...(content.whatWeNeed || [])
  ].join(' ').length;
  // The sheet now carries pricing + requirements + onboarding, so it compacts sooner.
  const tight = weight > 1150;
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
          new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 20 },
            children: [new TextRun({ text: clientData.clientName || 'Valued Client', bold: true, size: 24, color: INK })] }),
          new Paragraph({ alignment: AlignmentType.RIGHT,
            children: [new TextRun({
              text: (clientData.signerName ? `Attn: ${clientData.signerName}  \u00b7  ` : '') +
                new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric' }),
              size: 15, color: MUTED })] })
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
    spacing: { before: S(330, 210), after: S(150, 105), line: 310 },
    children: [new TextRun({ text: content.headline, bold: true, size: S(34, 30), color: INK })]
  }));

  // ================= INTRO =================
  children.push(new Paragraph({
    spacing: { after: S(320, 210), line: S(320, 290) },
    children: richRuns(content.personalIntro, { size: S(22, 20), color: BODY, boldColor: INK })
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
        bulletCell(content.theirProblem.points, HALF, MUTED, BODY, cellBorders, tight, INK),
        bulletCell(content.ourSolution.points, CW - HALF, ACCENT, BODY, cellBorders, tight, ACCENT)
      ]})
    ]
  }));

  // ================= WHY US =================
  children.push(new Paragraph({
    spacing: { before: S(360, 240), after: 40 },
    children: [new TextRun({ text: content.whyUs.title.toUpperCase(), bold: true, size: 18, color: ACCENT, characterSpacing: 30 })]
  }));
  children.push(new Paragraph({
    spacing: { after: S(180, 130) },
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

  // ================= PRICING: FLEXIBLE, NO RISK =================
  // (No rate table - per Vince, rates flex with volume and are quoted per deal.)
  children.push(spacer(S(300, 190)));
  children.push(new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [CW],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: CW, type: WidthType.DXA },
      shading: { fill: TINT, type: ShadingType.CLEAR },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
        left: { style: BorderStyle.SINGLE, size: 14, color: ACCENT },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
        right: { style: BorderStyle.SINGLE, size: 4, color: RULE }
      },
      margins: { top: S(150, 110), bottom: S(150, 110), left: 200, right: 180 },
      children: [
        new Paragraph({ spacing: { after: 50 }, children: [
          new TextRun({ text: '100% contingency \u2014 you only pay on what we recover.', bold: true, size: S(20, 18), color: INK })
        ]}),
        new Paragraph({ spacing: { line: S(280, 260) }, children: [
          new TextRun({ text: 'No signup, submission, monthly, or yearly fees. Our rates are flexible and improve with the volume you place \u2014 tell us what you have and we\u2019ll quote it.', size: S(18, 17), color: BODY })
        ]})
      ]
    })]})]
  }));

  // ================= WHAT WE NEED / ONBOARDING =================
  children.push(spacer(S(280, 180)));
  children.push(new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [HALF, CW - HALF],
    rows: [new TableRow({ children: [
      infoCell('WHAT WE NEED TO GET STARTED', (content.whatWeNeed || []).map(
        t => new Paragraph({
          spacing: { before: 70, after: 0, line: S(270, 250) },
          indent: { left: 180, hanging: 180 },
          children: [
            new TextRun({ text: '\u2713  ', bold: true, color: ACCENT, size: S(18, 17) }),
            new TextRun({ text: t, size: S(18, 17), color: BODY })
          ]
        })), HALF, ACCENT, MUTED, RULE, tight),
      infoCell('ONBOARDING', [new Paragraph({
        spacing: { before: 70, line: S(275, 255) },
        children: richRuns(content.onboarding, { size: S(18, 17), color: BODY, boldColor: INK })
      })], CW - HALF, ACCENT, MUTED, RULE, tight)
    ]})]
  }));

  // ================= CALL TO ACTION =================
  children.push(spacer(S(300, 190)));
  children.push(new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [CW],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: CW, type: WidthType.DXA },
      shading: { fill: ACCENT, type: ShadingType.CLEAR },
      borders: { top: none, left: none, bottom: none, right: none },
      margins: { top: S(170, 125), bottom: S(170, 125), left: 300, right: 300 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: 300 },
        children: richRuns(content.callToAction, { size: S(22, 20), color: WHITE, boldColor: WHITE, forceBold: true })
      })]
    })]})]
  }));

  // ================= FOOTER =================
  children.push(new Paragraph({
    spacing: { before: S(320, 200), after: S(120, 90) },
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
function bulletCell(points, width, bulletColor, textColor, borders, tight, boldColor) {
  const S = (r, c) => (tight ? c : r);
  const paragraphs = (points || []).map((point, i) => new Paragraph({
    spacing: { before: i === 0 ? 0 : S(120, 80), after: 0, line: S(290, 265) },
    indent: { left: 200, hanging: 200 },
    children: [
      new TextRun({ text: '\u2014  ', bold: true, color: bulletColor, size: S(20, 18) }),
      ...richRuns(point, { size: S(20, 18), color: textColor, boldColor: boldColor || textColor })
    ]
  }));
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    margins: { top: S(150, 115), bottom: S(160, 120), left: 180, right: 160 },
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
    margins: { top: S(140, 110), bottom: S(110, 70), left: 90, right: 130 },
    verticalAlign: VerticalAlign.TOP,
    children: [new Paragraph({
      spacing: { line: S(280, 255) },
      children: [new TextRun({ text: text, size: S(17, 16), color: textColor })]
    })]
  });
}

module.exports = { generateOnePager };
