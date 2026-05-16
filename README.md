# CipherChat — End-to-End Encrypted Messenger

A secure, browser-based instant messaging application with **true End-to-End Encryption (E2EE)** — no registration, no login, no server-side message storage. All cryptographic operations happen entirely in your browser.

---

## Live Demo

Click here: [e2ee-chat-kappa.vercel.app](https://e2ee-chat-kappa.vercel.app)

---

## Features

- **Zero Registration** — identity is a locally generated ECDH key pair, stored only in your browser
- **True E2EE** — messages are encrypted with AES-256-GCM before leaving your device; the server never sees plaintext
- **Instant Room Creation** — one click generates a private room with a shareable invite link or QR code
- **Out-of-Band Key Exchange** — secure ECDH handshake via invite link; no trust in the server required
- **Session Persistence** — chat history and keys are stored in IndexedDB and restored automatically on re-open
- **Dark / Light Mode** — auto-detects system preference with a manual toggle

---

## 🏗️ Architecture Overview

```
Browser A                        Server (Relay Only)               Browser B
─────────────────                ───────────────────               ─────────────────
Generate ECDH key pair           Stores only:                      Generate ECDH key pair
Create room (UUID)      ──────▶  • Room ID                ──────▶  Open invite link
Share invite link                • Active sockets                   Extract Room ID + pubkey A
                                 • No messages                      Send pubkey B via socket
Exchange public keys    ◀──────  Relay public keys        ──────▶  Exchange public keys
Derive shared AES key            (never stores them)               Derive shared AES key
Encrypt with AES-GCM   ──────▶  Relay ciphertext only    ──────▶  Decrypt with AES-GCM
Store in IndexedDB               (discarded immediately)           Store in IndexedDB
```

The server is **zero-knowledge** — it only relays encrypted payloads and enforces room capacity limits. It never touches plaintext, keys, or message history.

---

## 🛠️ Technology Stack

### Frontend

| Technology            | Purpose                                         |
| --------------------- | ----------------------------------------------- |
| React 19 + TypeScript | UI framework with hooks and context             |
| Vite 8                | Build tool and dev server                       |
| Tailwind CSS v4       | Utility-first styling with native dark mode     |
| React Router v7       | Client-side routing (`/`, `/room/:id`, `/join`) |
| Web Crypto API        | ECDH key generation, AES-GCM encrypt/decrypt    |
| IndexedDB (`idb`)     | Persistent local storage for keys and messages  |
| Socket.io Client v4   | Real-time WebSocket communication               |

### Backend

| Technology          | Purpose                                                 |
| ------------------- | ------------------------------------------------------- |
| Node.js + Express 5 | HTTP server and health endpoint                         |
| Socket.io v4        | WebSocket room management and message relay             |
| TypeScript (`tsx`)  | Type-safe server code with zero build step              |
| In-memory only      | No database — rooms exist only while sockets are active |

### Testing

| Tool           | Purpose                                         |
| -------------- | ----------------------------------------------- |
| Vitest         | Unit and integration tests (frontend + backend) |
| Playwright     | End-to-end browser tests                        |
| fake-indexeddb | IndexedDB mock for frontend unit tests          |

---

## 📁 Project Structure

```
cipher-chat/
├── package.json              # Root — E2E test scripts (Playwright)
├── playwright.config.ts      # Playwright config (boots both servers)
├── e2e/
│   └── chat.spec.ts          # End-to-end tests
│
├── backend/
│   ├── package.json
│   └── src/
│       ├── index.ts          # Entry point — starts HTTP server on PORT (default: 3001)
│       ├── server.ts         # Core logic: Socket.io events, rate limiting, room management
│       ├── types.ts          # Shared TypeScript interfaces (EncryptedPayload, etc.)
│       └── __tests__/
│           ├── unit.test.ts  # Unit tests (validation, rate limiting)
│           └── socket.test.ts
│
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── App.tsx           # Routes: /, /room/:channelId, /join (OOB redirect)
        ├── main.tsx
        ├── lib/
        │   ├── __tests__/    # Unit test for crypto and db modules
        │   |   ├── crypto.test.ts
        │   |   └── db.test.ts
        │   ├── crypto.ts     # ECDH key gen, AES-GCM encrypt/decrypt, fingerprints
        │   ├── db.ts         # IndexedDB (identity, channels, messages stores)
        │   └── socket.ts     # Socket.io client singleton
        ├── context/
        │   ├── IdentityContext.tsx   # Loads/creates ECDH key pair on first visit
        │   └── ThemeContext.tsx      # Dark/light mode state
        ├── hooks/
        │   ├── useRoom.ts    # Room join, key exchange, send/receive messages
        │   └── useClipboard.ts
        ├── components/
        │   ├── Layout.tsx
        │   ├── CreateRoom.tsx
        │   ├── ChannelList.tsx
        │   ├── MessageList.tsx
        │   ├── MessageBubble.tsx
        │   ├── MessageInput.tsx
        │   └── PeerStatus.tsx
        ├── pages/
        │   ├── HomePage.tsx
        │   ├── ChatPage.tsx
        │   └── NotFoundPage.tsx
        └── types/
            └── index.ts
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later

### 1. Clone the repository

```bash
git clone https://github.com/your-username/cipher-chat.git
cd cipher-chat
```

### 2. Install dependencies

```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 3. Start the development servers

**Backend** (Terminal 1):

```bash
cd backend
npm run dev
# Server starts on http://localhost:3001
```

**Frontend** (Terminal 2):

```bash
cd frontend
npm run dev
# App available at http://localhost:5173
```

### 4. Open and start chatting

1. Open `http://localhost:5173` in **Browser A**
2. Click **Create Room** — copy the invite link
3. Open the invite link in **Browser B** (different browser or incognito window)
4. Both browsers complete the ECDH handshake automatically
5. Start chatting — all messages are encrypted end-to-end

---

## 🔒 Cryptography Details

| Component          | Algorithm               | Notes                                                                |
| ------------------ | ----------------------- | -------------------------------------------------------------------- |
| Key Exchange       | ECDH P-256              | Per-room key pair; non-extractable derived key                       |
| Message Encryption | AES-256-GCM             | 96-bit random IV per message; authenticated encryption               |
| Key Fingerprint    | SHA-256 (first 8 bytes) | Displayed as `XXXX XXXX XXXX XXXX` for manual peer verification      |
| Key Storage        | IndexedDB               | Private key stored as JWK; shared key as non-extractable `CryptoKey` |

All crypto uses the browser's native **Web Crypto API** — no third-party cryptography libraries.

---

## 🛡️ Security Model & Server Protections

The server enforces the following to prevent abuse:

| Protection         | Detail                                              |
| ------------------ | --------------------------------------------------- |
| Room ID validation | Must be a valid UUIDv4 (122-bit entropy)            |
| Room capacity      | Max **2 sockets** per room                          |
| Join rate limit    | Max **5 join attempts** per socket per 60 seconds   |
| Message rate limit | Max **60 messages** per socket per 60 seconds       |
| Payload size cap   | **64 KB** max (Socket.io `maxHttpBufferSize`)       |
| No persistence     | No messages, keys, or user data are written to disk |

---

## 🧪 Running Tests

### Unit & Integration Tests

```bash
# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test
```

### End-to-End Tests (Playwright)

```bash
# From the project root (boots both servers automatically)
npm run test:e2e

# With browser UI visible
npm run test:e2e:headed
```

---

## ⚙️ Environment Variables

### Backend

| Variable          | Default | Description                                                  |
| ----------------- | ------- | ------------------------------------------------------------ |
| `PORT`            | `3001`  | Port the HTTP/WebSocket server listens on                    |
| `FRONTEND_ORIGIN` | `*`     | Allowed CORS origin (set to your frontend URL in production) |

Example `.env` for production:

```env
PORT=3001
FRONTEND_ORIGIN=https://your-domain.com
```

---

## 🌐 Deployment

### Frontend

Build a static bundle and serve it from any CDN or static host (Vercel, Netlify, etc.):

```bash
cd frontend
npm run build
# Output in frontend/dist/
```

### Backend

Deploy the Node.js server to any host that supports WebSockets (Railway, Fly.io, Render, etc.):

```bash
cd backend
npm start
```

Set the `FRONTEND_ORIGIN` environment variable to your frontend's deployed URL to lock down CORS.

---

## 📄 Data Model

### Client-side (IndexedDB — `cipher-chat` database)

| Store      | Key           | Fields                                                                    |
| ---------- | ------------- | ------------------------------------------------------------------------- |
| `identity` | `"singleton"` | `publicKeyRaw`, `privateKeyJwk`                                           |
| `channels` | `channelId`   | `channelId`, `peerPublicKeyRaw`, `sharedKeyJwk`, `createdAt`, `nickname`  |
| `messages` | `messageId`   | `id`, `channelId`, `sender`, `content` (plaintext), `timestamp`, `status` |

### Server-side (in-memory only, never persisted)

| Data                                    | Lifetime                                         |
| --------------------------------------- | ------------------------------------------------ |
| Room membership (socket → room mapping) | Duration of socket connection                    |
| Encrypted message payloads              | In-flight relay only; discarded after forwarding |
| Rate limit timestamps                   | Cleared on disconnect                            |
