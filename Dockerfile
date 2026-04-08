FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

# Copia dependências primeiro (cache layer)
COPY package*.json ./
RUN npm ci --omit=dev

# Instala browsers do Playwright
RUN npx playwright install chromium --with-deps

# Copia o resto do código
COPY src/ ./src/

EXPOSE 3000

CMD ["node", "src/server.js"]
