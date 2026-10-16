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

# Plain node, not nodemon: when the app crashes the process exits, so the
# container exits and docker's restart policy brings it back (and the crash
# shows up in `docker ps` / RestartCount). nodemon instead keeps PID 1 alive
# "waiting for file changes", leaving a running container with a dead app.
# node directly rather than via yarn so SIGTERM reaches the app.
CMD ["node", "bin/www.js"]
