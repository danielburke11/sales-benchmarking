# Node 20 LTS
FROM node:20-alpine

WORKDIR /app

# Copy package files (no npm install needed for this app; we only run node)
COPY package.json ./
COPY server ./server
COPY index.html styles.css app.js ./

# Create data dir for requests.json (writable at runtime)
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=2 \
  CMD wget -q -O - http://localhost:${PORT}/health || exit 1

CMD ["node", "server/index.js"]
