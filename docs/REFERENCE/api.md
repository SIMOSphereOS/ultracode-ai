# API Dokumentation

> ⚠️ **Vision / noch nicht implementiert.** Dieses Dokument beschreibt eine geplante REST/WebSocket/JWT-API, die **nicht** Teil des aktuellen Codes ist. UltraCode AI ist heute ein lokales CLI-Tool (`packages/cli`) ohne HTTP-Server, ohne Cloud-Endpoint (`api.ultracode.ai` existiert nicht) und ohne Authentifizierungs-Layer. Bis diese Komponenten gebaut sind, ist nichts hier funktionsfähig. Verbindlich ist allein die [CLI-Referenz](./cli-commands.md).

> **Komplette REST & WebSocket API für UltraCode AI - OpenAPI 3.0 kompatibel** *(geplant)*

---

## 🚀 Übersicht

Die UltraCode AI API bietet einen umfassenden Zugriff auf alle Funktionen von UltraCode AI. Sie ist RESTful, gut dokumentiert und folgt Best Practices für API-Design.

---

## 📋 API-Informationen

| **Eigenschaft** | **Wert** |
|----------------|-----------|
| **Version** | v1 |
| **Base URL** | `https://api.ultracode.ai/v1` (Cloud) / `http://localhost:3000/v1` (Self-Hosted) |
| **Protocol** | HTTPS (empfohlen) / HTTP (Entwicklung) |
| **Format** | JSON |
| **Authentication** | Bearer Token (JWT) |
| **Rate Limit** | 1000 Anfragen pro Minute (Standard) |
| **CORS** | Aktiviert |
| **OpenAPI Spec** | [/api/docs.json](#) |
| **Swagger UI** | [/api/docs](#) |

---

## 🔐 Authentication

### JWT Authentication

Alle API-Anfragen (außer Authentication-Endpunkte) erfordern einen gültigen JWT-Token im `Authorization`-Header.

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token erhalten

**Request:**
```http
POST /api/v1/auth/login HTTP/1.1
Host: api.ultracode.ai
Content-Type: application/json

{
  "email": "alice@yourcompany.com",
  "password": "secure-password"
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4...",
  "expiresIn": 86400,
  "user": {
    "id": "user_123",
    "email": "alice@yourcompany.com",
    "username": "alice",
    "role": "developer"
  }
}
```

### Token auffrischen

**Request:**
```http
POST /api/v1/auth/refresh HTTP/1.1
Host: api.ultracode.ai
Content-Type: application/json

{
  "refreshToken": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4..."
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400
}
```

### Logout

**Request:**
```http
POST /api/v1/auth/logout HTTP/1.1
Host: api.ultracode.ai
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "message": "Successfully logged out"
}
```

---

## 👤 User API

### User erstellen

**Request:**
```http
POST /api/v1/users HTTP/1.1
Host: api.ultracode.ai
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "email": "newuser@yourcompany.com",
  "username": "newuser",
  "firstName": "New",
  "lastName": "User",
  "password": "secure-password",
  "role": "developer"
}
```

**Response:**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "success": true,
  "user": {
    "id": "user_456",
    "email": "newuser@yourcompany.com",
    "username": "newuser",
    "firstName": "New",
    "lastName": "User",
    "role": "developer",
    "createdAt": "2026-06-11T12:00:00.000Z",
    "updatedAt": "2026-06-11T12:00:00.000Z"
  }
}
```

### Alle User auflisten

**Request:**
```http
GET /api/v1/users HTTP/1.1
Host: api.ultracode.ai
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Query Parameter:**
- `role` (optional): Filter nach Rolle
- `team` (optional): Filter nach Team
- `search` (optional): Suche in Namen/E-Mail
- `limit` (optional, default: 50): Maximale Anzahl Ergebnisse
- `offset` (optional, default: 0): Skip Offset

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "users": [
    {
      "id": "user_123",
      "email": "alice@yourcompany.com",
      "username": "alice",
      "firstName": "Alice",
      "lastName": "Smith",
      "role": "developer",
      "createdAt": "2026-01-01T10:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 50,
    "offset": 0
  }
}
```

### Spezifischen User abrufen

**Request:**
```http
GET /api/v1/users/{id} HTTP/1.1
Host: api.ultracode.ai
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "user": {
    "id": "user_123",
    "email": "alice@yourcompany.com",
    "username": "alice",
    "firstName": "Alice",
    "lastName": "Smith",
    "role": "developer",
    "preferences": {
      "theme": "dark",
      "language": "en",
      "fontSize": 14
    },
    "metadata": {
      "createdAt": "2026-01-01T10:00:00.000Z",
      "lastLogin": "2026-06-11T12:00:00.000Z",
      "loginCount": 42,
      "projectsContributed": 15,
      "codeReviews": 23,
      "suggestionsAccepted": 89
    }
  }
}
```

### User aktualisieren

**Request:**
```http
PUT /api/v1/users/{id} HTTP/1.1
Host: api.ultracode.ai
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "firstName": "Alice",
  "lastName": "Smith",
  "role": "team-lead"
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "user": {
    "id": "user_123",
    "email": "alice@yourcompany.com",
    "username": "alice",
    "firstName": "Alice",
    "lastName": "Smith",
    "role": "team-lead",
    "updatedAt": "2026-06-11T12:30:00.000Z"
  }
}
```

### User löschen

**Request:**
```http
DELETE /api/v1/users/{id} HTTP/1.1
Host: api.ultracode.ai
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "message": "User deleted successfully"
}
```

---

## 👥 Team API

### Team erstellen

**Request:**
```http
POST /api/v1/teams HTTP/1.1
Host: api.ultracode.ai
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "name": "Dev Team A",
  "description": "Backend Development Team",
  "leadId": "user_123",
  "memberIds": ["user_124", "user_125"]
}
```

**Response:**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "success": true,
  "team": {
    "id": "team_123",
    "name": "Dev Team A",
    "description": "Backend Development Team",
    "leadId": "user_123",
    "memberIds": ["user_124", "user_125"],
    "createdAt": "2026-06-11T12:00:00.000Z"
  }
}
```

### Alle Teams auflisten

**Request:**
```http
GET /api/v1/teams HTTP/1.1
Host: api.ultracode.ai
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Query Parameter:**
- `search` (optional): Suche in Namen/Beschreibung
- `limit` (optional, default: 50)
- `offset` (optional, default: 0)

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "teams": [
    {
      "id": "team_123",
      "name": "Dev Team A",
      "description": "Backend Development Team",
      "memberCount": 3,
      "createdAt": "2026-01-01T10:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 50,
    "offset": 0
  }
}
```

---

## 📁 Project API

### Project erstellen

**Request:**
```http
POST /api/v1/projects HTTP/1.1
Host: api.ultracode.ai
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "name": "New Product",
  "description": "New product development",
  "teamId": "team_123",
  "leadId": "user_123",
  "visibility": "private"
}
```

**Response:**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "success": true,
  "project": {
    "id": "project_123",
    "name": "New Product",
    "description": "New product development",
    "teamId": "team_123",
    "leadId": "user_123",
    "visibility": "private",
    "createdAt": "2026-06-11T12:00:00.000Z"
  }
}
```

### Alle Projects auflisten

**Request:**
```http
GET /api/v1/projects HTTP/1.1
Host: api.ultracode.ai
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Query Parameter:**
- `teamId` (optional): Filter nach Team
- `userId` (optional): Filter nach Benutzer
- `search` (optional): Suche in Namen/Beschreibung
- `visibility` (optional): Filter nach Sichtbarkeit
- `limit` (optional, default: 50)
- `offset` (optional, default: 0)

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "projects": [
    {
      "id": "project_123",
      "name": "New Product",
      "description": "New product development",
      "teamId": "team_123",
      "visibility": "private",
      "createdAt": "2026-01-01T10:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 50,
    "offset": 0
  }
}
```

---

## 🤖 AI API

### Code Completion

**Request:**
```http
POST /api/v1/ai/complete HTTP/1.1
Host: api.ultracode.ai
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "prompt": "def calculate_factorial(n):",
  "language": "python",
  "context": "This is a helper function for...",
  "maxTokens": 100,
  "temperature": 0.7,
  "stop": ["\n", ";"]
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "completions": [
    {
      "text": "    if n == 0:\n        return 1\n    else:\n        return n * calculate_factorial(n-1)",
      "score": 0.98,
      "finishReason": "stop"
    }
  ],
  "usage": {
    "promptTokens": 20,
    "completionTokens": 30,
    "totalTokens": 50
  }
}
```

### Chat Completion

**Request:**
```http
POST /api/v1/ai/chat HTTP/1.1
Host: api.ultracode.ai
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful coding assistant."
    },
    {
      "role": "user",
      "content": "How do I write a TypeScript interface for a User?"
    }
  ],
  "model": "gpt-4",
  "maxTokens": 1000,
  "temperature": 0.7,
  "stream": false
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "message": {
    "role": "assistant",
    "content": "Here's how you can define a TypeScript interface for a User:\n\n```typescript\ninterface User {\n  id: string;\n  name: string;\n  email: string;\n  age?: number;\n  createdAt: Date;\n}\n```"
  },
  "usage": {
    "promptTokens": 50,
    "completionTokens": 100,
    "totalTokens": 150
  }
}
```

### Code Analysis

**Request:**
```http
POST /api/v1/ai/analyze HTTP/1.1
Host: api.ultracode.ai
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "code": "function calculateSum(a, b) { return a + b; }",
  "language": "javascript",
  "analyze": [
    "quality",
    "security",
    "performance",
    "complexity"
  ]
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "analysis": {
    "quality": {
      "score": 95,
      "issues": []
    },
    "security": {
      "score": 100,
      "issues": []
    },
    "performance": {
      "score": 90,
      "issues": [
        {
          "type": "warning",
          "message": "Consider using arrow function syntax",
          "line": 1,
          "severity": "low"
        }
      ]
    },
    "complexity": {
      "score": 85,
      "cyclomatic": 1,
      "halstead": {
        "volume": 10,
        "difficulty": 2,
        "effort": 20
      }
    }
  }
}
```

---

## 💻 Code API

### Code generieren

**Request:**
```http
POST /api/v1/code/generate HTTP/1.1
Host: api.ultracode.ai
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "type": "function",
  "language": "typescript",
  "name": "UserService",
  "description": "Service for managing users",
  "requirements": [
    "CRUD operations",
    "Validation",
    "TypeScript interfaces"
  ],
  "context": {
    "database": "postgresql",
    "orm": "prisma"
  }
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "code": "interface User {\n  id: string;\n  name: string;\n  email: string;\n  createdAt: Date;\n}\n\nclass UserService {\n  async createUser(data: Partial<User>): Promise<User> {\n    // Implementation\n  }\n  \n  async getUser(id: string): Promise<User | null> {\n    // Implementation\n  }\n  \n  async updateUser(id: string, data: Partial<User>): Promise<User> {\n    // Implementation\n  }\n  \n  async deleteUser(id: string): Promise<void> {\n    // Implementation\n  }\n}",
  "files": [
    {
      "name": "UserService.ts",
      "content": "...",
      "path": "src/services/UserService.ts"
    },
    {
      "name": "User.ts",
      "content": "...",
      "path": "src/types/User.ts"
    }
  ]
}
```

---

## 🔢 Versioning API

### Change Analysis

**Request:**
```http
POST /api/v1/version/analyze HTTP/1.1
Host: api.ultracode.ai
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "projectId": "project_123",
  "changes": [
    {
      "type": "feat",
      "description": "Add user authentication",
      "files": ["auth.ts", "user.ts"]
    },
    {
      "type": "fix",
      "description": "Fix login bug",
      "files": ["auth.ts"]
    }
  ],
  "context": {
    "currentVersion": "1.0.0",
    "previousChanges": []
  }
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "analysis": {
    "type": "feat",
    "scope": "auth",
    "impact": "major",
    "breakingChanges": false,
    "qualityScore": 95,
    "securityScore": 100,
    "performanceScore": 90,
    "recommendation": "2.0.0",
    "confidence": 0.95,
    "explanation": "Added major feature: user authentication. Following semantic versioning, this should be a major version bump."
  }
}
```

### Version Suggest

**Request:**
```http
POST /api/v1/version/suggest HTTP/1.1
Host: api.ultracode.ai
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "projectId": "project_123",
  "changes": [
    {
      "type": "feat",
      "description": "Add user authentication"
    }
  ]
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "suggestions": [
    {
      "version": "2.0.0",
      "confidence": 0.95,
      "type": "major",
      "reason": "Added user authentication feature (major feature)"
    },
    {
      "version": "1.1.0",
      "confidence": 0.05,
      "type": "minor",
      "reason": "If authentication is considered a minor enhancement"
    }
  ],
  "recommendation": "2.0.0"
}
```

---

## 🧠 Knowledge API

### Wissen hinzufügen

**Request:**
```http
POST /api/v1/knowledge HTTP/1.1
Host: api.ultracode.ai
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "title": "TypeScript Best Practices",
  "content": "Always use interfaces for type definitions...",
  "category": "Best Practices",
  "scope": "global",
  "tags": ["typescript", "best-practices", "code-quality"],
  "metadata": {
    "author": "user_123",
    "team": "Dev Team A"
  }
}
```

**Response:**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "success": true,
  "knowledge": {
    "id": "knowledge_123",
    "title": "TypeScript Best Practices",
    "createdAt": "2026-06-11T12:00:00.000Z"
  }
}
```

### Wissen durchsuchen

**Request:**
```http
GET /api/v1/knowledge?search=TypeScript HTTP/1.1
Host: api.ultracode.ai
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "results": [
    {
      "id": "knowledge_123",
      "title": "TypeScript Best Practices",
      "excerpt": "Always use interfaces for type definitions...",
      "category": "Best Practices",
      "score": 0.95
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 10,
    "offset": 0
  }
}
```

---

## 📊 System API

### Health Check

**Request:**
```http
GET /api/v1/health HTTP/1.1
Host: api.ultracode.ai
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 86400,
  "services": {
    "database": "healthy",
    "cache": "healthy",
    "ai": "healthy",
    "queue": "healthy"
  },
  "timestamp": "2026-06-11T12:00:00.000Z"
}
```

### Metrics

**Request:**
```http
GET /api/v1/metrics HTTP/1.1
Host: api.ultracode.ai
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "metrics": {
    "requests": {
      "total": 12345,
      "success": 12300,
      "errors": 45
    },
    "ai": {
      "tokensUsed": 567890,
      "requests": 2345,
      "models": {
        "gpt-4": 1000,
        "claude-3-sonnet": 500,
        "mistral-large": 845
      }
    },
    "code": {
      "generated": 12345,
      "analyzed": 5678,
      "reviewed": 345
    }
  }
}
```

---

## 🚨 Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {
      "field": "email",
      "value": "invalid-email",
      "reason": "Invalid email format"
    },
    "timestamp": "2026-06-11T12:00:00.000Z",
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### Häufige Error Codes

| **Code** | **HTTP Status** | **Beschreibung** |
|----------|-----------------|------------------|
| `AUTH_REQUIRED` | 401 | Authentication fehlend |
| `AUTH_EXPIRED` | 401 | Token abgelaufen |
| `AUTH_INVALID` | 401 | Ungültiger Token |
| `PERMISSION_DENIED` | 403 | Keine Berechtigung |
| `NOT_FOUND` | 404 | Ressource nicht gefunden |
| `VALIDATION_ERROR` | 400 | Validierungsfehler |
| `RATE_LIMITED` | 429 | Zu viele Anfragen |
| `INTERNAL_ERROR` | 500 | Interner Serverfehler |
| `SERVICE_UNAVAILABLE` | 503 | Service nicht verfügbar |

---

## 📝 OpenAPI Specification

Die vollständige OpenAPI 3.0 Specification ist verfügbar unter:
- **URL**: `/api/v1/docs.json`
- **Swagger UI**: `/api/v1/docs`

**Beispiel OpenAPI YAML:**
```yaml
openapi: 3.0.0
info:
  title: UltraCode AI API
  version: 1.0.0
  description: The world's best AI coding assistant API
  license:
    name: Apache 2.0
    url: https://www.apache.org/licenses/LICENSE-2.0

servers:
  - url: https://api.ultracode.ai/v1
  - url: http://localhost:3000/v1

paths:
  /auth/login:
    post:
      summary: Login
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/LoginRequest'
      responses:
        '200':
          description: Successful login
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/LoginResponse'

components:
  schemas:
    LoginRequest:
      type: object
      properties:
        email:
          type: string
          format: email
        password:
          type: string
          format: password
      required:
        - email
        - password
    
    LoginResponse:
      type: object
      properties:
        success:
          type: boolean
        token:
          type: string
        refreshToken:
          type: string
        expiresIn:
          type: integer
        user:
          $ref: '#/components/schemas/User'

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

---

## 🔗 SDKs & Client Libraries

### Offizielle SDKs

| **Sprache** | **Package** | **Dokumentation** |
|-------------|-------------|--------------------|
| JavaScript/TypeScript | `@ultracode/sdk` | [JS SDK Docs](#) |
| Python | `ultracode-sdk` | [Python SDK Docs](#) |
| Go | `github.com/ultracode/ultracode-go` | [Go SDK Docs](#) |
| Java | `com.ultracode:ultracode-java` | [Java SDK Docs](#) |
| .NET | `UltraCode.Sdk` | [.NET SDK Docs](#) |

### JavaScript SDK Beispiel

```javascript
import { UltraCodeClient } from '@ultracode/sdk';

const client = new UltraCodeClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.ultracode.ai/v1'
});

// Code generieren
const code = await client.code.generate({
  type: 'function',
  language: 'typescript',
  name: 'UserService'
});

console.log(code);
```

### Python SDK Beispiel

```python
from ultracode import UltraCodeClient

client = UltraCodeClient(
    api_key='your-api-key',
    base_url='https://api.ultracode.ai/v1'
)

# Code generieren
code = client.code.generate(
    type='function',
    language='python',
    name='UserService'
)

print(code)
```

---

## 📞 Support

- **API-Fragen**: api@ultracode.ai
- **SDK-Anfragen**: sdk@ultracode.ai
- **Allgemeiner Support**: support@ultracode.ai

© 2026 UltraCode AI Team
