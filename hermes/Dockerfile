FROM node:22-slim
WORKDIR /app
COPY hermes/package.json hermes/tsconfig.json ./
COPY lib/knowledge/ ./lib/knowledge/
COPY lib/x-api/ ./lib/x-api/
RUN npm install --production
COPY hermes/*.ts ./
EXPOSE 3002
CMD ["node", "--import", "tsx", "server.ts"]
