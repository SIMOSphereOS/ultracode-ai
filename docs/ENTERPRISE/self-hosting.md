# Selbsthosting

> ⚠️ **Vision / noch nicht implementiert.** UltraCode AI hat heute keinen server-seitigen Dienst, der sich „self-hosten“ ließe — es ist ein lokales CLI, das auf der eigenen Maschine läuft. Die folgende Anleitung beschreibt eine geplante self-hosted Server-Variante und ist **derzeit nicht lauffähig**. Für die reale Nutzung siehe [Installation](../GETTING-STARTED/installation.md).

> **Komplette Anleitung zum Selbsthosting von UltraCode AI - Volle Kontrolle über Ihre Daten** *(geplant)*

---

## 🚀 Übersicht

UltraCode AI kann vollständig in Ihrer eigenen Infrastruktur gehostet werden. Dies gibt Ihnen volle Kontrolle über Ihre Daten, verbesserte Sicherheit und die Möglichkeit, die Lösung an Ihre spezifischen Anforderungen anzupassen.

---

## 📋 Voraussetzungen

### Hardware-Anforderungen

| **Komponente** | **Minimal** | **Empfohlen (Team)** | **Empfohlen (Enterprise)** |
|----------------|-------------|---------------------|---------------------------|
| CPU | 4 Kerne | 8+ Kerne | 16+ Kerne |
| RAM | 8 GB | 16+ GB | 32+ GB |
| Festplatte | 100 GB SSD | 500 GB SSD | 1 TB+ SSD (RAID) |
| GPU | ❌ | ✅ (für LLM) | ✅ (mehrere für LLM) |

### Software-Anforderungen

**Betriebssystem:**
- Linux (Ubuntu 22.04 LTS, RHEL 8+, Debian 11+)
- macOS (12+ Monterey)
- Windows Server (2019+)

**Container-Runtime:**
- Docker (20.10+)
- Docker Compose (2.0+)
- Oder Kubernetes (1.25+)

**Abhängigkeiten:**
- Node.js (18+ LTS)
- Python (3.10+)
- Git (2.30+)

---

## 🛠️ Installationsmethoden

### Option 1: Docker Compose (empfohlen für Entwicklung)

#### 1. Repository klonen

```bash
git clone https://github.com/AndreasSchwan-SIMO/UltraCode.git
cd ultracode
```

#### 2. Umgebungsvariablen konfigurieren

```bash
# .env Datei erstellen
cp .env.example .env

# .env Datei bearbeiten
nano .env
```

**Wichtige Umgebungsvariablen:**

```env
# Server Konfiguration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Datenbank
DATABASE_URL=postgresql://ultracode:password@db:5432/ultracode

# Redis Cache
REDIS_URL=redis://redis:6379/0

# AI Provider
AI_PROVIDER=openai
OPENAI_API_KEY=your-api-key

# Auth
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-encryption-key
```

#### 3. Docker Compose starten

```bash
# Alle Dienste starten
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Status prüfen
docker compose ps
```

#### 4. Dienste verifizieren

```bash
# UltraCode AI Server
curl http://localhost:3000/health

# Datenbank
curl http://localhost:5432/health  # PostgreSQL

# Redis
redis-cli ping
```

### Option 2: Docker Compose für Enterprise

**`docker-compose.enterprise.yml`:**

```yaml
version: '3.8'

services:
  # UltraCode AI Core
  ultracode:
    image: ultracode/ultracode-enterprise:latest
    container_name: ultracode
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://ultracode:${DB_PASSWORD}@db:5432/ultracode
      - REDIS_URL=redis://redis:6379/0
      - AI_PROVIDER=${AI_PROVIDER}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - JWT_SECRET=${JWT_SECRET}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    volumes:
      - ./data/ultracode:/app/data
      - ./config:/app/config
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - ultracode

  # PostgreSQL Datenbank
  db:
    image: postgres:15-alpine
    container_name: ultracode-db
    restart: unless-stopped
    environment:
      - POSTGRES_USER=ultracode
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=ultracode
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ultracode"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - ultracode

  # Redis Cache
  redis:
    image: redis:7-alpine
    container_name: ultracode-redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - ./data/redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - ultracode

  # AI Service (optional, selbst gehostet)
  ai-service:
    image: ultracode/ai-service:latest
    container_name: ultracode-ai
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      - MODEL_PATH=/models
      - MAX_CONTEXT_LENGTH=16384
    volumes:
      - ./models:/models
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    networks:
      - ultracode

  # Nginx Reverse Proxy (optional)
  nginx:
    image: nginx:alpine
    container_name: ultracode-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    depends_on:
      - ultracode
    networks:
      - ultracode

networks:
  ultracode:
    driver: bridge
```

### Option 3: Kubernetes (Production)

#### 1. Namespace erstellen

```bash
kubectl create namespace ultracode
```

#### 2. Secrets erstellen

```bash
kubectl create secret generic ultracode-secrets \
  --namespace ultracode \
  --from-literal=db-password=your-db-password \
  --from-literal=jwt-secret=your-jwt-secret \
  --from-literal=encryption-key=your-encryption-key \
  --from-literal=openai-api-key=your-api-key
```

#### 3. Persistent Volumes erstellen

```yaml
# pv.yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: ultracode-pv
  namespace: ultracode
spec:
  storageClassName: manual
  capacity:
    storage: 100Gi
  accessModes:
    - ReadWriteMany
  hostPath:
    path: /mnt/ultracode
```

#### 4. Deployment

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ultracode
  namespace: ultracode
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ultracode
  template:
    metadata:
      labels:
        app: ultracode
    spec:
      containers:
        - name: ultracode
          image: ultracode/ultracode-enterprise:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: production
            - name: DATABASE_URL
              value: postgresql://ultracode:$(DB_PASSWORD)@ultracode-db:5432/ultracode
            - name: REDIS_URL
              value: redis://ultracode-redis:6379/0
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: ultracode-secrets
                  key: jwt-secret
            - name: ENCRYPTION_KEY
              valueFrom:
                secretKeyRef:
                  name: ultracode-secrets
                  key: encryption-key
          volumeMounts:
            - name: ultracode-data
              mountPath: /app/data
      volumes:
        - name: ultracode-data
          persistentVolumeClaim:
            claimName: ultracode-pvc
```

#### 5. Service und Ingress

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: ultracode
  namespace: ultracode
spec:
  selector:
    app: ultracode
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
  type: ClusterIP

# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ultracode-ingress
  namespace: ultracode
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - ultracode.yourcompany.com
      secretName: ultracode-tls
  rules:
    - host: ultracode.yourcompany.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ultracode
                port:
                  number: 80
```

---

## 📁 Dateistruktur

```
ultracode/
├── config/
│   ├── ultracode.yml          # Hauptkonfiguration
│   ├── security.yml           # Sicherheitskonfiguration
│   ├── database.yml           # Datenbankkonfiguration
│   └── ai.yml                 # AI-Konfiguration
├── data/
│   ├── postgres/              # PostgreSQL Daten
│   ├── redis/                 # Redis Daten
│   └── ultracode/             # UltraCode AI Daten
├── models/                   # LLM Modelle (optional)
├── certs/                    # SSL Zertifikate
├── docker-compose.yml        # Docker Compose
├── docker-compose.prod.yml   # Production Compose
└── nginx.conf                # Nginx Konfiguration
```

---

## ⚙️ Konfiguration

### Hauptkonfiguration (`config/ultracode.yml`)

```yaml
# Server Konfiguration
server:
  port: 3000
  host: 0.0.0.0
  cors:
    enabled: true
    origins: ["https://*.yourcompany.com"]
  rateLimit:
    windowMs: 15 * 60 * 1000
    max: 1000

# Datenbank
 database:
  url: postgresql://ultracode:password@db:5432/ultracode
  pool:
    max: 20
    min: 5
  ssl: true

# Cache
cache:
  url: redis://redis:6379/0
  ttl: 3600

# AI Provider
ai:
  provider: openai
  openai:
    apiKey: ${OPENAI_API_KEY}
    model: gpt-4
  fallback:
    - provider: anthropic
      model: claude-3-sonnet
    - provider: mistral
      model: mistral-large

# Feature Flags
features:
  aiVersioning: true
  releasePlanning: true
  qualityGates: true
  teamCollaboration: true

# Performance
performance:
  maxContextLength: 16384
  concurrentRequests: 100
  timeout: 120000
```

---

## 🔧 Wartung

### Backups

```bash
# Datenbank Backup
docker exec ultracode-db pg_dump -U ultracode ultracode > backup.sql

# Volle Backup-Skript
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups/${TIMESTAMP}"

mkdir -p ${BACKUP_DIR}

# Datenbank
docker exec ultracode-db pg_dump -U ultracode ultracode > ${BACKUP_DIR}/db.sql

# Redis
docker exec ultracode-redis redis-cli SAVE > ${BACKUP_DIR}/redis.rdb

# Konfiguration
cp -r config ${BACKUP_DIR}/

# Archive
tar -czvf ${TIMESTAMP}.tar.gz ${BACKUP_DIR}

# Altes löschen (30 Tage)
find ./backups -mtime +30 -type d -exec rm -rf {} \;
```

### Monitoring

**Prometheus + Grafana Setup:**

```yaml
# monitoring/docker-compose.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    volumes:
      - ./grafana:/var/lib/grafana

  node-exporter:
    image: prom/node-exporter
    ports:
      - "9100:9100"
```

### Logging

```bash
# Alle Logs anzeigen
docker compose logs -f

# Spezifische Service Logs
docker compose logs -f ultracode

# Log Rotation konfigurieren
logrotate:
  daily
  rotate: 30
  compress
  delaycompress
  missingok
  notifempty
  create 0644 ultracode ultracode
```

---

## 🔄 Updates

### Versionsprüfung

```bash
# Aktuelle Version
ultracode-ai version

# Neue Version prüfen
ultracode-ai update check
```

### Update-Prozess

```bash
# 1. Backup erstellen
./backup.sh

# 2. Container stoppen
docker compose down

# 3. neue Version pullen
docker compose pull

# 4. Migration ausführen (falls nötig)
ultracode-ai db migrate

# 5. Container starten
docker compose up -d

# 6. Status prüfen
ultracode-ai health
```

---

## 🛑 Fehlerbehebung

### Häufige Probleme

| **Problem** | **Lösung** |
|-------------|------------|
| Port 3000 bereits belegt | `lsof -i :3000` und Prozess beenden |
| Datenbankverbindung fehlgeschlagen | .env prüfen, Docker Netzwerk prüfen |
| Redis Verbindung fehlgeschlagen | Redis Container Status prüfen |
| Speicherplatz voll | Volumes bereinigen, Backup löschen |
| Hohe CPU-Nutzung | Skalierung prüfen, AI-Model wechseln |

### Debug Modus aktivieren

```bash
# Docker Compose mit Debug Logging
docker compose -f docker-compose.yml -f docker-compose.debug.yml up

# Oder Umgebungsvariable setzen
export DEBUG=ultracode:*
docker compose up
```

---

## 📊 Performance-Optimierung

### Ressourcen-Limits

```yaml
# docker-compose.yml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 4G
    reservations:
      cpus: '0.5'
      memory: 1G
```

### Caching-Strategien

```yaml
# config/cache.yml
cache:
  layers:
    - type: memory
      size: 1000
      ttl: 300
    - type: redis
      url: redis://redis:6379/0
      ttl: 3600
    - type: filesystem
      path: ./cache
      ttl: 86400
```

---

## 🔗 Nächste Schritte

- [➡️ Sicherheitskonfiguration](./security.md)
- [➡️ Team-Zusammenarbeit](./team-collaboration.md)
- [➡️ API-Dokumentation](../REFERENCE/api.md)

---

## 📞 Support

- **Dokumentation**: [https://docs.ultracode.ai](https://docs.ultracode.ai)
- **Community**: [https://discord.gg/ultracode](https://discord.gg/ultracode)
- **Enterprise-Support**: support@ultracode.ai

© 2026 UltraCode AI Team
