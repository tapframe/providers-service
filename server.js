require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getUHDMoviesStreams } = require('./providers/uhdmovies');
const { getDramaDripStreams } = require('./providers/dramadrip');
const { getTopMoviesStreams } = require('./providers/topmovies');
const { getMoviesModStreams } = require('./providers/moviesmod');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// UHDMovies endpoint
app.get('/api/streams/uhdmovies/:tmdbId', async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { type, season, episode } = req.query;
    
    console.log(`[Provider Service] UHDMovies request: ${tmdbId}, type: ${type}, season: ${season}, episode: ${episode}`);
    
    const streams = await getUHDMoviesStreams(tmdbId, type, season, episode);
    
    res.json({ 
      success: true, 
      streams: streams || [],
      provider: 'UHDMovies',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`[Provider Service] UHDMovies error:`, error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      provider: 'UHDMovies',
      timestamp: new Date().toISOString()
    });
  }
});

// DramaDrip endpoint
app.get('/api/streams/dramadrip/:tmdbId', async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { type, season, episode } = req.query;
    
    console.log(`[Provider Service] DramaDrip request: ${tmdbId}, type: ${type}, season: ${season}, episode: ${episode}`);
    
    const streams = await getDramaDripStreams(tmdbId, type, season, episode);
    
    res.json({ 
      success: true, 
      streams: streams || [],
      provider: 'DramaDrip',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`[Provider Service] DramaDrip error:`, error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      provider: 'DramaDrip',
      timestamp: new Date().toISOString()
    });
  }
});

// TopMovies endpoint
app.get('/api/streams/topmovies/:tmdbId', async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { type } = req.query;
    
    console.log(`[Provider Service] TopMovies request: ${tmdbId}, type: ${type}`);
    
    // TopMovies only supports movies
    if (type !== 'movie') {
      return res.json({ 
        success: true, 
        streams: [],
        provider: 'TopMovies',
        message: 'TopMovies only supports movies',
        timestamp: new Date().toISOString()
      });
    }
    
    const streams = await getTopMoviesStreams(tmdbId, type);
    
    res.json({ 
      success: true, 
      streams: streams || [],
      provider: 'TopMovies',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`[Provider Service] TopMovies error:`, error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      provider: 'TopMovies',
      timestamp: new Date().toISOString()
    });
  }
});

// MoviesMod endpoint
app.get('/api/streams/moviesmod/:tmdbId', async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { type, season, episode } = req.query;
    
    console.log(`[Provider Service] MoviesMod request: ${tmdbId}, type: ${type}, season: ${season}, episode: ${episode}`);
    
    const streams = await getMoviesModStreams(tmdbId, type, season, episode);
    
    res.json({ 
      success: true, 
      streams: streams || [],
      provider: 'MoviesMod',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`[Provider Service] MoviesMod error:`, error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      provider: 'MoviesMod',
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Endpoint not found',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`[Provider Service] Server running on port ${PORT}`);
  console.log(`[Provider Service] Health check: http://localhost:${PORT}/health`);
});

module.exports = app;