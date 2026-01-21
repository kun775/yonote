# YoNote

English | [简体中文](./README.md)

A lightweight online Markdown note-taking application with real-time preview, auto-save, password protection, and content encryption.

## Features

- **Instant Creation**: Create notes without registration
- **Real-time Preview**: Split-pane editor/preview (PC), toggle mode (mobile)
- **Auto-save**: Automatically saves 1 second after you stop typing
- **Enhanced Markdown**: Task lists, footnotes, highlights, superscript/subscript
- **Code Highlighting**: Syntax highlighting for multiple programming languages
- **Math Formulas**: KaTeX/MathJax support for mathematical expressions
- **Password Protection**: Set passwords to protect your notes
- **Content Encryption**: AES encryption using Fernet
- **Responsive Design**: Works on desktop and mobile devices

## Deployment Options

YoNote supports two deployment methods:

| Method | Stack | Use Case |
|--------|-------|----------|
| **Flask Version** | Python + SQLite | Traditional servers, Docker |
| **Worker Version** | Cloudflare Workers + D1 | Serverless, Edge computing |

> For Worker deployment guide, see [worker/README.md](./worker/README.md)

## Tech Stack

### Flask Version

| Layer | Technology |
|-------|------------|
| Backend | Flask 2.0.1 |
| Database | SQLite 3 |
| Encryption | Fernet (PBKDF2HMAC + AES) |
| XSS Protection | bleach (HTML sanitizer) |
| Markdown | Python-Markdown + pymdown-extensions |
| Frontend | Marked.js, KaTeX, Highlight.js |
| Container | Docker + Supervisor |

### Worker Version

| Layer | Technology |
|-------|------------|
| Runtime | Cloudflare Workers |
| Framework | Hono |
| Database | D1 (SQLite) |
| Encryption | Web Crypto API (AES-GCM) |

## Quick Start

### Local Development

```bash
# Clone the repository
git clone https://github.com/kun775/yonote.git
cd yonote

# Install dependencies
pip install -r requirements.txt

# Run development server
python app.py
# Server runs at http://localhost:5005
```

### Docker Deployment

```bash
# Build and start
docker-compose up -d

# View logs
docker logs -f yonote
```

### Cloudflare Workers Deployment

```bash
cd worker

# Install dependencies
npm install

# Create D1 database
wrangler d1 create yonote

# Initialize database
npm run db:init

# Deploy
npm run deploy
```

For detailed steps, see [Worker Deployment Guide](./worker/README.md).

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | Flask session key | `dev_key_please_change` |
| `ENCRYPTION_KEY` | Note encryption key | (change in production) |
| `ENCRYPTION_SALT` | Encryption salt | (change in production) |

> Always change default values in production!

## API Endpoints

| Route | Method | Function |
|-------|--------|----------|
| `/` | GET | Create new note and redirect |
| `/<key>` | GET | View/edit note |
| `/<key>/update` | POST | Update note content and settings |
| `/<key>/auto-save` | POST | Auto-save (JSON) |
| `/<key>/verify` | POST | Verify note password |
| `/<key>/delete` | GET | Delete note |
| `/<key>/download` | GET | Download note as txt |
| `/render-markdown` | POST | Server-side Markdown rendering |

## Security

- **Content Encryption**: AES encryption for stored note content using Fernet
- **Password Protection**: SHA256 hashed passwords for notes
- **Access Control**: Three modes - public, protected public, private
- **Brute Force Protection**: 30-minute lockout after 5 failed attempts
- **Rate Limiting**: 2,000,000 daily / 50,000 hourly request limits
- **XSS Protection**: HTML sanitization using bleach library

## Project Structure

```
yonote/
├── app.py                    # Flask main application
├── config.py                 # Configuration
├── requirements.txt          # Python dependencies
├── Dockerfile                # Docker build file
├── docker-compose.yml        # Docker Compose config
├── templates/
│   ├── view.html             # Note view template
│   └── password.html         # Password verification page
├── static/
│   ├── app.js                # Frontend main logic
│   ├── function.js           # Utility functions
│   └── style.css             # Stylesheets
├── data/
│   └── notes.db              # SQLite database
└── worker/                   # Cloudflare Workers version
    ├── src/                  # Source code
    ├── wrangler.toml         # Wrangler config
    └── README.md             # Worker deployment docs
```

## Development Guide

### Code Linting

```bash
# Install Ruff
pip install ruff

# Check code
ruff check .

# Check formatting
ruff format --check .

# Auto-fix
ruff check --fix .
```

### Coding Standards

- **Python**: Follow PEP 8
- **JavaScript**: ES6+ syntax, use `const`/`let`
- **CSS**: BEM naming convention, mobile-first

## CI/CD

The project uses GitHub Actions for automation:

- **CI Pipeline**: Code linting (Ruff), security scanning (Bandit/Safety), testing (pytest)
- **Docker Pipeline**: Auto-build and push to GitHub Container Registry

## License

MIT License

## Contributing

Issues and Pull Requests are welcome!
