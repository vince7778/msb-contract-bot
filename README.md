# MSB Contract Bot

A Slack bot that automatically generates contracts and one-pagers using Claude AI.

## Features

- **Collection Service Agreements** - Full legal contracts for new clients
- **NDAs** - Non-disclosure agreements
- **Contract Amendments** - Modify existing agreements
- **One-Pagers** - Professional sales sheets customized per prospect

## Setup

### 1. Create Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Name it "ContractBot" and select your workspace

### 2. Configure Slack App

**OAuth & Permissions** - Add these Bot Token Scopes:
- `app_mentions:read`
- `chat:write`
- `files:write`
- `im:history`
- `channels:history`

**Event Subscriptions**:
- Enable Events
- Subscribe to bot events: `app_mention`, `message.im`

**Socket Mode**:
- Enable Socket Mode
- Generate an App-Level Token with `connections:write` scope

### 3. Get Your Tokens

From your Slack app settings, copy:
- **Bot User OAuth Token** (starts with `xoxb-`)
- **Signing Secret** (from Basic Information)
- **App-Level Token** (starts with `xapp-`)

### 4. Get Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an API key

### 5. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your tokens:

```
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token
ANTHROPIC_API_KEY=your-anthropic-key

COMPANY_NAME=Midwest Service Bureau LLC
COMPANY_ADDRESS=Your Address Here
COMPANY_PHONE=(316) 555-1234
COMPANY_EMAIL=contracts@msbureau.com
```

### 6. Install & Run

```bash
npm install
npm start
```

### 7. Install to Workspace

1. In your Slack app settings, go to "Install App"
2. Click "Install to Workspace"
3. Authorize the app
4. Invite the bot to #contracts: `/invite @ContractBot`

## Usage

Mention the bot in #contracts channel:

```
@ContractBot collection agreement for ABC Medical Center
```

```
@ContractBot nda for XYZ Healthcare
```

```
@ContractBot one-pager for Golden Plains Credit Union, industry: credit union
```

```
@ContractBot amendment for Sanitas FL, change fee to 20%
```

The bot will:
1. Parse your request
2. Generate the document using Claude AI
3. Upload the DOCX file to the thread

## Deployment Options

### Option 1: PM2 (Recommended for VPS)

```bash
npm install -g pm2
pm2 start src/index.js --name contract-bot
pm2 save
pm2 startup
```

### Option 2: Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
CMD ["npm", "start"]
```

```bash
docker build -t msb-contract-bot .
docker run -d --env-file .env msb-contract-bot
```

### Option 3: Easypanel

1. Create new service
2. Connect your Git repo or upload files
3. Set environment variables
4. Deploy

## Customization

### Add New Contract Templates

Edit `src/contractGenerator.js`:

1. Add new prompt function (e.g., `getNewContractPrompt()`)
2. Add to `CONTRACT_TYPES` in `src/index.js`
3. Add case to the prompts object

### Modify One-Pager Design

Edit `src/onePagerGenerator.js`:

- Change colors: Modify `primaryColor` and `accentColor`
- Change layout: Modify the table structures
- Add sections: Add new paragraphs/tables to `children` array

## Troubleshooting

**Bot not responding?**
- Check Socket Mode is enabled
- Verify bot is invited to the channel
- Check logs: `pm2 logs contract-bot`

**Document generation fails?**
- Verify Anthropic API key is valid
- Check Claude API usage limits

**File upload fails?**
- Ensure `files:write` scope is added
- Reinstall the app to workspace

## Support

For issues, contact the development team or check the logs.
