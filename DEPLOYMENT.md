# Provider Service Deployment Guide

This guide covers deploying the provider service as a separate microservice for UHDMovies, DramaDrip, TopMovies, and MoviesMod providers.

## Quick Start

1. **Prepare the service:**
   ```bash
   cd provider-service
   npm install
   cp .env.example .env
   # Edit .env with your TMDB_API_KEY
   ```

2. **Test locally:**
   ```bash
   npm start
   # Service will run on http://localhost:3001
   ```

3. **Deploy to your preferred platform** (see platform-specific guides below)

4. **Configure main addon:**
   ```env
   # In your main addon's .env file
   EXTERNAL_UHDMOVIES_URL=https://your-deployed-service.com
   EXTERNAL_DRAMADRIP_URL=https://your-deployed-service.com
   EXTERNAL_TOPMOVIES_URL=https://your-deployed-service.com
   EXTERNAL_MOVIESMOD_URL=https://your-deployed-service.com
   ```

## Platform Deployment

### Render

1. Connect your GitHub repository
2. Create a new Web Service
3. Set build command: `cd provider-service && npm install`
4. Set start command: `cd provider-service && npm start`
5. Add environment variables:
   - `TMDB_API_KEY`: Your TMDB API key
   - `PORT`: 10000 (Render default)

### Railway

1. Connect your GitHub repository
2. Select the `provider-service` directory as root
3. Railway will auto-detect Node.js
4. Add environment variables:
   - `TMDB_API_KEY`: Your TMDB API key

### Koyeb

1. Connect your GitHub repository
2. Set build command: `cd provider-service && npm install`
3. Set run command: `cd provider-service && npm start`
4. Add environment variables:
   - `TMDB_API_KEY`: Your TMDB API key

### Vercel

1. Connect your GitHub repository
2. Set root directory to `provider-service`
3. Vercel will auto-detect Node.js
4. Add environment variables:
   - `TMDB_API_KEY`: Your TMDB API key
   - `VERCEL`: true

## API Endpoints

Once deployed, your service will provide these endpoints:

- `GET /health` - Health check
- `POST /api/uhdmovies` - UHDMovies streams
- `POST /api/dramadrip` - DramaDrip streams
- `POST /api/topmovies` - TopMovies streams
- `POST /api/moviesmod` - MoviesMod streams

## Monitoring

- Check `/health` endpoint for service status
- Monitor logs for provider-specific errors
- Set up uptime monitoring for your deployed service

## Troubleshooting

**Service not responding:**
- Check if TMDB_API_KEY is set correctly
- Verify the service is running on the correct port
- Check deployment logs for errors

**Main addon not using external service:**
- Verify EXTERNAL_*_URL environment variables are set
- Check network connectivity between services
- Review main addon logs for external provider requests

**Provider errors:**
- Check individual provider logs in the service
- Verify provider websites are accessible
- Some providers may require additional configuration