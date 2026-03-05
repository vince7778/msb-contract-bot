#!/bin/bash

# MSB Contract Bot Deployment Script
# Run this on your server to deploy the bot

echo "=================================="
echo "MSB Contract Bot Deployment"
echo "=================================="
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed."
    echo "Please install Node.js v18+ first: https://nodejs.org/"
    exit 1
fi

echo "Node.js version: $(node -v)"
echo ""

# Install dependencies
echo "Installing dependencies..."
npm install
echo ""

# Check for .env file
if [ ! -f .env ]; then
    echo "ERROR: .env file not found!"
    echo "Please copy .env.example to .env and fill in your credentials."
    exit 1
fi

echo "Configuration found!"
echo ""

# Install PM2 globally if not present
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
fi

# Start with PM2
echo "Starting bot with PM2..."
pm2 start src/index.js --name "msb-contract-bot"
pm2 save

echo ""
echo "=================================="
echo "Deployment complete!"
echo ""
echo "Useful commands:"
echo "  pm2 logs msb-contract-bot  - View logs"
echo "  pm2 restart msb-contract-bot - Restart bot"
echo "  pm2 stop msb-contract-bot  - Stop bot"
echo "  pm2 status                 - Check status"
echo "=================================="
