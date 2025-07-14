# NuvioStreams Provider Service

A microservice that hosts UHDMovies, DramaDrip, TopMovies, and MoviesMod providers for the NuvioStreams addon.

## Overview

This service exposes REST API endpoints for the four specified providers, allowing the main addon to call them remotely instead of running them locally.

## API Endpoints

### UHDMovies
```
GET /api/streams/uhdmovies/:tmdbId?type=movie&season=1&episode=1
```

### DramaDrip
```
GET /api/streams/dramadrip/:tmdbId?type=tv&season=1&episode=1
```

### TopMovies (Movies only)
```
GET /api/streams/topmovies/:tmdbId?type=movie
```

### MoviesMod
```
GET /api/streams/moviesmod/:tmdbId?type=movie&season=1&episode=1
```

### Health Check
```
GET /health
```

## Response Format

```json
{
  "success": true,
  "streams": [
    {
      "quality": "1080p",
      "size": "2.5 GB",
      "url": "https://example.com/stream",
      "title": "Movie Title"
    }
  ],
  "provider": "UHDMovies",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Setup

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Edit `.env` and add your TMDB API key:
```
TMDB_API_KEY=your_actual_tmdb_api_key
```

4. Start the development server:
```bash
npm run dev
```

The service will be available at `http://localhost:3001`

### Production Deployment

#### Deploy to Render

1. Create a new Web Service on Render
2. Connect your repository
3. Set the following:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment Variables**:
     - `TMDB_API_KEY`: Your TMDB API key
     - `PORT`: 3001 (or leave default)

#### Deploy to Koyeb

1. Create a new App on Koyeb
2. Connect your repository
3. Set the following:
   - **Build Command**: `npm install`
   - **Run Command**: `npm start`
   - **Port**: 3001
   - **Environment Variables**:
     - `TMDB_API_KEY`: Your TMDB API key

#### Deploy to Railway

1. Create a new Project on Railway
2. Connect your repository
3. Set environment variables:
   - `TMDB_API_KEY`: Your TMDB API key
4. Railway will auto-detect the Node.js app and deploy

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `TMDB_API_KEY` | TMDB API key for provider functionality | Yes | - |
| `PORT` | Server port | No | 3001 |
| `DISABLE_CACHE` | Disable internal caching | No | false |
| `VERCEL` | Set to true when deploying to Vercel | No | false |

## Integration with Main Addon

After deploying the provider service, update your main addon's `.env` file:

```env
# Enable external providers
USE_EXTERNAL_PROVIDERS=true
PROVIDER_SERVICE_URL=https://your-provider-service.render.com

# Disable local providers (optional)
ENABLE_UHDMOVIES_PROVIDER=false
ENABLE_DRAMADRIP_PROVIDER=false
ENABLE_TOPMOVIES_PROVIDER=false
ENABLE_MOVIESMOD_PROVIDER=false
```

## Monitoring

- Health check endpoint: `GET /health`
- Logs are output to console for monitoring
- Each request includes timestamp and provider information

## Error Handling

- All endpoints return consistent JSON responses
- Errors include error messages and timestamps
- 500 status codes for provider errors
- 404 status codes for unknown endpoints

## Performance

- Each provider maintains its own internal caching
- CORS enabled for cross-origin requests
- Timeout handling for provider requests
- Graceful error handling with fallbacks