FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
# npm ci: cài đúng phiên bản trong package-lock.json (không tự nâng phiên bản), lặp lại được và không kéo gói lạ.
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
EXPOSE 80
