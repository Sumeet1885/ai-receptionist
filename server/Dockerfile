FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY --chown=node:node . .

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

USER node

CMD ["npm", "start"]
