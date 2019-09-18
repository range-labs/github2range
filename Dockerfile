FROM node:10
WORKDIR /usr/src/github2range
COPY package*.json ./
RUN npm install
COPY lib/* ./lib/
CMD ["npm", "start"]
