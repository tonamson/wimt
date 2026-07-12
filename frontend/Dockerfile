FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV WIMT_DB_PATH=/app/data/wimt.sqlite

EXPOSE 3000

CMD ["npm", "start"]
