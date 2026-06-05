# MSB Contract Bot - Railway deployment image
# node:18-slim matches .node-version; LibreOffice is included for
# one-pager DOCX -> PDF conversion (src/pdfConverter.js).
FROM node:18-slim

# libreoffice-writer       - headless docx -> pdf conversion
# fonts-crosextra-carlito  - metric-compatible Calibri substitute
#                            (one-pager uses Calibri)
# fonts-noto-color-emoji   - emoji in the one-pager contact footer
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    fonts-crosextra-carlito \
    fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

CMD ["node", "src/index.js"]
