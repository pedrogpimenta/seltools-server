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

# Plain node, not nodemon: when the app crashes the process (and so the
# container) exits and compose's restart policy brings it back. nodemon would
# sit on "app crashed - waiting for file changes" with the container still
# "running". Use `yarn dev` for live reload while developing.
CMD ["yarn", "start"]
