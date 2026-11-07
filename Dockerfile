# Stage 1: Build de la app React 18 con Webpack 5
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Servidor Web Nginx liviano en puerto 4202
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 4202
CMD ["nginx", "-g", "daemon off;"]
