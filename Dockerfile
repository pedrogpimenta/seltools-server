FROM node:20-slim

# Create app directory
WORKDIR /usr/src/app

# Install pnpm or yarn
RUN corepack enable

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Bundle app source
COPY . .

# Expose API port
EXPOSE 3344

# Set host to 0.0.0.0 to allow external connections
ENV HOST=0.0.0.0
ENV PORT=3344

# Start the application with nodemon
CMD ["yarn", "start"]
