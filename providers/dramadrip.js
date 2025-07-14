const axios = require('axios');
const cheerio = require('cheerio');
const FormData = require('form-data');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const { URLSearchParams, URL } = require('url');
const fs = require('fs').promises;
const path = require('path');
const { findBestMatch } = require('string-similarity');

const TMDB_API_KEY = process.env.TMDB_API_KEY || "439c478a771f35c05022f9feabcca01c";

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'); // $& means the whole matched string
}

// --- Domain Fetching ---
let dramaDripDomain = 'https://dramadrip.com'; // Fallback domain
let domainCacheTimestamp = 0;
const DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

async function getDramaDripDomain() {
    const now = Date.now();
    if (now - domainCacheTimestamp < DOMAIN_CACHE_TTL) {
        return dramaDripDomain;
    }

    try {
        console.log('[DramaDrip] Fetching latest domain...');
        const response = await axios.get('https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json', { timeout: 10000 });
        if (response.data && response.data.dramadrip) {
            dramaDripDomain = response.data.dramadrip;
            domainCacheTimestamp = now;
            console.log(`[DramaDrip] Updated domain to: ${dramaDripDomain}`);
        } else {
            console.warn('[DramaDrip] Domain JSON fetched, but "dramadrip" key was not found. Using fallback.');
        }
    } catch (error) {
        console.error(`[DramaDrip] Failed to fetch latest domain, using fallback. Error: ${error.message}`);
    }
    return dramaDripDomain;
}

// --- Caching Configuration ---
const CACHE_ENABLED = process.env.DISABLE_CACHE !== 'true';
const CACHE_DIR = process.env.VERCEL ? path.join('/tmp', '.dramadrip_cache') : path.join(__dirname, '.cache', 'dramadrip');
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

// --- Caching Helper Functions ---
const ensureCacheDir = async () => {
    if (!CACHE_ENABLED) return;
    try {
        await fs.mkdir(CACHE_DIR, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') console.error(`[DramaDrip Cache] Error creating cache directory: ${error.message}`);
    }
};

const getFromCache = async (key) => {
    if (!CACHE_ENABLED) return null;
    const cacheFile = path.join(CACHE_DIR, `${key}.json`);
    try {
        const data = await fs.readFile(cacheFile, 'utf-8');
        const cached = JSON.parse(data);
        if (Date.now() > cached.expiry) {
            console.log(`[DramaDrip Cache] EXPIRED for key: ${key}`);
            await fs.unlink(cacheFile).catch(() => {});
            return null;
        }
        console.log(`[DramaDrip Cache] HIT for key: ${key}`);
        return cached.data;
    } catch (error) {
        return null;
    }
};

const saveToCache = async (key, data) => {
    if (!CACHE_ENABLED) return;
    const cacheFile = path.join(CACHE_DIR, `${key}.json`);
    const cacheData = {
        expiry: Date.now() + CACHE_TTL,
        data: data
    };
    try {
        await fs.writeFile(cacheFile, JSON.stringify(cacheData, null, 2), 'utf-8');
        console.log(`[DramaDrip Cache] SAVED for key: ${key}`);
    } catch (error) {
        console.error(`[DramaDrip Cache] WRITE ERROR for key ${key}: ${error.message}`);
    }
};

// Initialize cache directory
ensureCacheDir();

// Helper function to parse quality strings into numerical values
function parseQuality(qualityString) {
    if (!qualityString || typeof qualityString !== 'string') return 0;
    const q = qualityString.toLowerCase();
    if (q.includes('2160p') || q.includes('4k')) return 2160;
    if (q.includes('1080p')) return 1080;
    if (q.includes('720p')) return 720;
    return 0; // Ignore qualities below 720p for sorting purposes
}

// Helper function to parse size strings into a number (in MB)
function parseSize(sizeString) {
    if (!sizeString || typeof sizeString !== 'string') return 0;
    const match = sizeString.match(/([0-9.,]+)\s*(GB|MB|KB)/i);
    if (!match) return 0;
    const sizeValue = parseFloat(match[1].replace(/,/g, ''));
    const unit = match[2].toUpperCase();
    if (unit === 'GB') return sizeValue * 1024;
    if (unit === 'MB') return sizeValue;
    if (unit === 'KB') return sizeValue / 1024;
    return 0;
}

// Search function for dramadrip.com
async function searchDramaDrip(query) {
    try {
        const baseUrl = await getDramaDripDomain();
        const searchUrl = `${baseUrl}/?s=${encodeURIComponent(query)}`;
        console.log(`[DramaDrip] Searching for: "${query}"`);
        const { data } = await axios.get(searchUrl);
        const $ = cheerio.load(data);
        const results = [];

        $('h2.entry-title a').each((i, element) => {
            const linkElement = $(element);
            const title = linkElement.text().trim();
            const url = linkElement.attr('href');
            if (title && url) {
                results.push({ title, url });
            }
        });
        return results;
    } catch (error) {
        console.error(`[DramaDrip] Error searching: ${error.message}`);
        return [];
    }
}

// Extracts season and quality links from a DramaDrip page
async function extractDramaDripLinks(url) {
    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);
        
        // Check for TV show season headers first
        const seasonHeaders = $('h2.wp-block-heading:contains("Season")');
        if (seasonHeaders.length > 0) {
            console.log('[DramaDrip] TV show detected. Extracting seasons...');
            const seasons = [];
            seasonHeaders.each((i, el) => {
                const header = $(el);
                const headerText = header.text().trim();
                const seasonInfo = { seasonTitle: headerText, qualities: [] };
                const buttonContainer = header.next('.wp-block-buttons');
                if (buttonContainer.length > 0) {
                    buttonContainer.find('a').each((j, linkEl) => {
                        const link = $(linkEl);
                        const qualityText = link.text().trim();
                        const linkUrl = link.attr('href');
                        if (linkUrl && !qualityText.toLowerCase().includes('zip')) {
                            seasonInfo.qualities.push({ quality: qualityText, url: linkUrl });
                        }
                    });
                }
                seasons.push(seasonInfo);
            });
            return { type: 'tv', data: seasons };
        }

        // If no season headers, assume it's a movie
        console.log('[DramaDrip] Movie detected. Extracting download qualities...');
        const qualities = [];
        $('.su-spoiler-content .wp-block-button a').each((i, el) => {
            const link = $(el);
            const qualityText = link.text().trim();
            const linkUrl = link.attr('href');
            if (linkUrl) {
                qualities.push({ quality: qualityText, url: linkUrl });
            }
        });

        if (qualities.length > 0) {
            return { type: 'movie', data: qualities };
        }
        
        console.log('[DramaDrip] Could not find any TV seasons or movie download links.');
        return null;

    } catch (error) {
        console.error(`[DramaDrip] Error extracting links: ${error.message}`);
        return null;
    }
}

// Resolves intermediate links from cinematickit.org or episodes.modpro.blog
async function resolveCinemaKitOrModproLink(initialUrl, refererUrl) {
    try {
        const { data } = await axios.get(initialUrl, { headers: { 'Referer': refererUrl } });
        const $ = cheerio.load(data);
        const finalLinks = [];
        
        // Try TV show selectors first
        let episodeLinks = $('.entry-content h3:contains("Episode") a');
        if (episodeLinks.length > 0) {
            episodeLinks.each((i, el) => {
                const link = $(el).attr('href');
                const text = $(el).text().trim();
                const isSupported = link && (link.includes('driveseed.org') || link.includes('tech.unblockedgames.world') || link.includes('tech.creativeexpressionsblog.com'));
                if (isSupported && text && !text.toLowerCase().includes('batch') && !text.toLowerCase().includes('zip')) {
                    finalLinks.push({ type: 'episode', name: text.replace(/\s+/g, ' '), url: link });
                }
            });
            return { type: 'episodes', links: finalLinks };
        }

        let seriesBtnLinks = $('.wp-block-button.series_btn a');
        if (seriesBtnLinks.length > 0) {
            seriesBtnLinks.each((i, el) => {
                const link = $(el).attr('href');
                const text = $(el).text().trim();
                const isSupported = link && (link.includes('driveseed.org') || link.includes('tech.unblockedgames.world') || link.includes('tech.creativeexpressionsblog.com'));
                if (isSupported && text && !text.toLowerCase().includes('batch') && !text.toLowerCase().includes('zip')) {
                     finalLinks.push({ type: 'episode', name: text.replace(/\s+/g, ' '), url: link });
                }
            });
            return { type: 'episodes', links: finalLinks };
        }

        // Fallback to movie selector
        $('.wp-block-button.movie_btn a').each((i, el) => {
             const link = $(el).attr('href');
             const text = $(el).text().trim();
             const isSupported = link && (link.includes('driveseed.org') || link.includes('tech.unblockedgames.world') || link.includes('tech.creativeexpressionsblog.com'));
             if(isSupported && text) {
                finalLinks.push({ type: 'server', name: text, url: link });
             }
        });

        if(finalLinks.length > 0) {
            return { type: 'servers', links: finalLinks };
        }

        return null; // No links found

    } catch (error) {
        console.error(`[DramaDrip] Error resolving intermediate link: ${error.message}`);
        return null;
    }
}

// Function to resolve tech.unblockedgames.world links to driveleech URLs (adapted from moviesmod.js)
async function resolveTechUnblockedLink(sidUrl) {
  console.log(`[DramaDrip] Resolving SID link: ${sidUrl}`);
  const { origin } = new URL(sidUrl);
  const jar = new CookieJar();
  const session = wrapper(axios.create({
    jar,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    }
  }));

  try {
    // Step 0: Get the _wp_http value
    console.log("  [SID] Step 0: Fetching initial page...");
    const responseStep0 = await session.get(sidUrl);
    let $ = cheerio.load(responseStep0.data);
    const initialForm = $('#landing');
    const wp_http_step1 = initialForm.find('input[name="_wp_http"]').val();
    const action_url_step1 = initialForm.attr('action');

    if (!wp_http_step1 || !action_url_step1) {
      console.error("  [SID] Error: Could not find _wp_http in initial form.");
      return null;
    }

    // Step 1: POST to the first form's action URL
    console.log("  [SID] Step 1: Submitting initial form...");
    const step1Data = new URLSearchParams({ '_wp_http': wp_http_step1 });
    const responseStep1 = await session.post(action_url_step1, step1Data, {
      headers: { 'Referer': sidUrl, 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    // Step 2: Parse verification page for second form
    console.log("  [SID] Step 2: Parsing verification page...");
    $ = cheerio.load(responseStep1.data);
    const verificationForm = $('#landing');
    const action_url_step2 = verificationForm.attr('action');
    const wp_http2 = verificationForm.find('input[name="_wp_http2"]').val();
    const token = verificationForm.find('input[name="token"]').val();

    if (!action_url_step2) {
      console.error("  [SID] Error: Could not find verification form.");
      return null;
    }

    // Step 3: POST to the verification URL
    console.log("  [SID] Step 3: Submitting verification...");
    const step2Data = new URLSearchParams({ '_wp_http2': wp_http2, 'token': token });
    const responseStep2 = await session.post(action_url_step2, step2Data, {
      headers: { 'Referer': responseStep1.request.res.responseUrl, 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    // Step 4: Find dynamic cookie and link from JavaScript
    console.log("  [SID] Step 4: Parsing final page for JS data...");
    let finalLinkPath = null;
    let cookieName = null;
    let cookieValue = null;

    const scriptContent = responseStep2.data;
    const cookieMatch = scriptContent.match(/s_343\('([^']+)',\s*'([^']+)'/);
    const linkMatch = scriptContent.match(/c\.setAttribute\("href",\s*"([^"]+)"\)/);
    
    if (cookieMatch) {
      cookieName = cookieMatch[1].trim();
      cookieValue = cookieMatch[2].trim();
    }
    if (linkMatch) {
      finalLinkPath = linkMatch[1].trim();
    }

    if (!finalLinkPath || !cookieName || !cookieValue) {
      console.error("  [SID] Error: Could not extract dynamic cookie/link from JS.");
      return null;
    }
    
    const finalUrl = new URL(finalLinkPath, origin).href;
    console.log(`  [SID] Dynamic link found: ${finalUrl}`);
    console.log(`  [SID] Dynamic cookie found: ${cookieName}`);

    // Step 5: Set cookie and make final request
    console.log("  [SID] Step 5: Setting cookie and making final request...");
    await jar.setCookie(`${cookieName}=${cookieValue}`, origin);
    
    const finalResponse = await session.get(finalUrl, {
      headers: { 'Referer': responseStep2.request.res.responseUrl }
    });

    // Step 6: Extract driveleech URL from meta refresh tag
    $ = cheerio.load(finalResponse.data);
    const metaRefresh = $('meta[http-equiv="refresh"]');
    if (metaRefresh.length > 0) {
        const content = metaRefresh.attr('content');
        const urlMatch = content.match(/url=(.*)/i);
        if (urlMatch && urlMatch[1]) {
            const driveleechUrl = urlMatch[1].replace(/"/g, "").replace(/'/g, "");
            console.log(`  [SID] SUCCESS! Resolved Driveleech URL: ${driveleechUrl}`);
            return driveleechUrl;
        }
    }

    console.error("  [SID] Error: Could not find meta refresh tag with Driveleech URL.");
    return null;

  } catch (error) {
    console.error(`  [SID] Error during SID resolution: ${error.message}`);
    if (error.response) {
      console.error(`  [SID] Status: ${error.response.status}`);
    }
    return null;
  }
}

// Resolves driveseed.org links to find download options
async function resolveDriveseedLink(driveseedUrl) {
    try {
        const { data } = await axios.get(driveseedUrl, { headers: { 'Referer': 'https://links.modpro.blog/' } });
        const redirectMatch = data.match(/window\.location\.replace\("([^"]+)"\)/);
        if (!redirectMatch) return null;

        const finalUrl = `https://driveseed.org${redirectMatch[1]}`;
        const { data: finalData } = await axios.get(finalUrl, { headers: { 'Referer': driveseedUrl } });
        const $ = cheerio.load(finalData);
        const downloadOptions = [];
        let title = null;
        let size = null;

        // Extract title and size from the final page
        const nameElement = $('li.list-group-item:contains("Name :")');
        if (nameElement.length > 0) {
            title = nameElement.text().replace('Name :', '').trim();
        }
        const sizeElement = $('li.list-group-item:contains("Size :")');
        if (sizeElement.length > 0) {
            size = sizeElement.text().replace('Size :', '').trim();
        }

        $('a:contains("Instant Download"), a:contains("Resume Cloud"), a:contains("Resume Worker Bot")').each((i, el) => {
            const button = $(el);
            const title = button.text().trim();
            let type = 'unknown';
            if (title.includes('Instant')) type = 'instant';
            if (title.includes('Resume Cloud')) type = 'resume';
            if (title.includes('Worker Bot')) type = 'worker';

            let url = button.attr('href');
            if (type === 'resume' && url && !url.startsWith('http')) {
                url = `https://driveseed.org${url}`;
            }
            if(url) downloadOptions.push({ title, type, url });
        });
        return { downloadOptions, title, size };
    } catch (error) {
        console.error(`[DramaDrip] Error resolving Driveseed link: ${error.message}`);
        return null;
    }
}

// Validate if a video URL is working (not 404 or broken)
async function validateVideoUrl(url, timeout = 10000) {
    try {
        console.log(`[DramaDrip] Validating URL: ${url.substring(0, 100)}...`);
        const response = await axios.head(url, {
            timeout,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Range': 'bytes=0-1' // Just request first byte to test
            }
        });
        
        // Check if status is OK (200-299) or partial content (206)
        if (response.status >= 200 && response.status < 400) {
            console.log(`[DramaDrip] ✓ URL validation successful (${response.status})`);
            return true;
        } else {
            console.log(`[DramaDrip] ✗ URL validation failed with status: ${response.status}`);
            return false;
        }
    } catch (error) {
        console.log(`[DramaDrip] ✗ URL validation failed: ${error.message}`);
        return false;
    }
}

// Resolves the final download link from the selected method
async function resolveFinalLink(downloadOption) {
    try {
        switch (downloadOption.type) {
            case 'instant':
                const urlObject = new URL(downloadOption.url);
                const keysParam = urlObject.searchParams.get('url');
                if (!keysParam) return null;
                const { data } = await axios.post('https://video-seed.pro/api', `keys=${keysParam}`, {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-token': 'video-seed.pro' }
                });
                return data ? data.url : null;

            case 'resume':
                const { data: resumeData } = await axios.get(downloadOption.url, { headers: { 'Referer': 'https://driveseed.org/' } });
                return cheerio.load(resumeData)('a:contains("Cloud Resume Download")').attr('href');

            case 'worker':
                const jar = new CookieJar();
                const session = wrapper(axios.create({ jar }));
                const { data: pageHtml } = await session.get(downloadOption.url);
                
                const scriptContent = pageHtml.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/g).find(s => s.includes("formData.append('token'"));
                if (!scriptContent) return null;

                const tokenMatch = scriptContent.match(/formData\.append\('token', '([^']+)'\)/);
                const idMatch = scriptContent.match(/fetch\('\/download\?id=([^']+)',/);
                if (!tokenMatch || !idMatch) return null;

                const formData = new FormData();
                formData.append('token', tokenMatch[1]);
                const apiUrl = `https://workerseed.dev/download?id=${idMatch[1]}`;
                const { data: apiResponse } = await session.post(apiUrl, formData, { headers: { ...formData.getHeaders(), 'x-requested-with': 'XMLHttpRequest' } });
                return apiResponse ? apiResponse.url : null;
            default:
                return null;
        }
    } catch (error) {
        console.error(`[DramaDrip] Error resolving final link for type ${downloadOption.type}: ${error.message}`);
        return null;
    }
}

// Main function for the provider
async function getDramaDripStreams(tmdbId, mediaType, seasonNum, episodeNum) {

    try {
        const cacheKey = `dramadrip_v2_${tmdbId}_${mediaType}${seasonNum ? `_s${seasonNum}e${episodeNum}` : ''}`;
        
        // 1. Check cache for resolved intermediate links
        let cachedLinks = await getFromCache(cacheKey);
        if (cachedLinks) {
            console.log(`[DramaDrip Cache] Using ${cachedLinks.length} cached intermediate links.`);
        } else {
            console.log(`[DramaDrip Cache] MISS for key: ${cacheKey}. Fetching from source.`);
            // 2. If cache miss, fetch from source
            const { data: tmdbData } = await axios.get(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}`);
            const title = mediaType === 'tv' ? tmdbData.name : tmdbData.title;
            const year = mediaType === 'tv' ? (tmdbData.first_air_date || '').substring(0, 4) : (tmdbData.release_date || '').substring(0, 4);

            console.log(`[DramaDrip] Searching for: "${title}" (${year})`);
            const searchResults = await searchDramaDrip(title);
            if (searchResults.length === 0) throw new Error(`No search results found for "${title}"`);

            // --- NEW: Use string similarity to find the best match ---
            const titles = searchResults.map(r => r.title);
            const bestMatch = findBestMatch(title, titles);
            
            console.log(`[DramaDrip] Best match for "${title}" is "${bestMatch.bestMatch.target}" with a rating of ${bestMatch.bestMatch.rating.toFixed(2)}`);

            let selectedResult = null;
            // Set a minimum confidence threshold
            if (bestMatch.bestMatch.rating > 0.3) {
                const bestResult = searchResults[bestMatch.bestMatchIndex];
                // For movies, double-check the year if available
                if (mediaType === 'movie' && year && bestResult.year && bestResult.year !== year) {
                     console.log(`[DramaDrip] Similarity match found, but year (${bestResult.year}) does not match expected year (${year}). Rejecting.`);
                } else {
                    selectedResult = bestResult;
                }
            }

            // --- FALLBACK: If similarity check fails, use a stricter regex search ---
            if (!selectedResult) {
                console.log(`[DramaDrip] Similarity match failed or was rejected. Falling back to stricter regex search.`);
                const cleanedTitle = escapeRegExp(title.toLowerCase());
                const titleRegex = new RegExp(`\\b${cleanedTitle}\\b`, 'i');

                selectedResult = searchResults.find(r => {
                    const lowerCaseResultTitle = r.title.toLowerCase();
                    if (!titleRegex.test(lowerCaseResultTitle)) return false;
                    
                    if (mediaType === 'movie' && year && r.year) {
                        return r.year === year;
                    } else if (mediaType === 'tv') {
                        // For TV shows, just matching the title is usually enough,
                        // as they often appear as "Show Title Season 1-3" etc.
                        return lowerCaseResultTitle.includes('season');
                    }
                    return true; // For movies without a year to check
                });
            }

            if (!selectedResult) {
                console.log(`[DramaDrip] All matching attempts failed for "${title}" (${year})`);
                return [];
            }
    
            console.log(`[DramaDrip] Selected result: "${selectedResult.title}" (${selectedResult.url})`);
            const extractedContent = await extractDramaDripLinks(selectedResult.url);
            if(!extractedContent) return [];

            let qualitiesToResolve = [];
            if(mediaType === 'tv' && extractedContent.type === 'tv') {
                const targetSeason = extractedContent.data.find(s => s.seasonTitle.includes(`Season ${seasonNum}`) && !s.seasonTitle.toLowerCase().includes('zip'));
                if (targetSeason) {
                    qualitiesToResolve = targetSeason.qualities.filter(q => !q.quality.includes('480p'));
                }
            } else if (mediaType === 'movie' && extractedContent.type === 'movie') {
                qualitiesToResolve = extractedContent.data.filter(q => !q.quality.includes('480p'));
            }

            if (qualitiesToResolve.length === 0) return [];

            // 3. Resolve to intermediate links (episodes or servers)
            const resolutionPromises = qualitiesToResolve.map(async (quality) => {
                const intermediateResult = await resolveCinemaKitOrModproLink(quality.url, selectedResult.url);
                if (intermediateResult) {
                    return { ...quality, intermediateResult };
                }
                return null;
            });
            
            cachedLinks = (await Promise.all(resolutionPromises)).filter(Boolean);

            // 4. Save to cache
            if (cachedLinks.length > 0) {
                await saveToCache(cacheKey, cachedLinks);
            }
        }

        if (!cachedLinks || cachedLinks.length === 0) {
            console.log('[DramaDrip] No intermediate links found after scraping/cache check.');
            return [];
        }

        // 5. Always fresh-fetch the final links from intermediate URLs
        const streamPromises = cachedLinks.map(async (linkInfo) => {
            try {
                const { intermediateResult } = linkInfo;
                let targetUrl = null;

                if (mediaType === 'tv' && intermediateResult.type === 'episodes') {
                    const targetEpisode = intermediateResult.links.find(e => e.name.includes(`Episode ${episodeNum}`));
                    if(targetEpisode) targetUrl = targetEpisode.url;
                } else if (mediaType === 'movie' && intermediateResult.type === 'servers') {
                    const fastServer = intermediateResult.links.find(s => s.name.includes('Server 1')) || intermediateResult.links[0];
                    if(fastServer) targetUrl = fastServer.url;
                }

                if (!targetUrl) return null;

                // Handle SID links first
                if (targetUrl.includes('tech.unblockedgames.world') || targetUrl.includes('tech.creativeexpressionsblog.com')) {
                    const resolvedUrl = await resolveTechUnblockedLink(targetUrl);
                    if (!resolvedUrl) return null;
                    targetUrl = resolvedUrl;
                }

                if (!targetUrl || !targetUrl.includes('driveseed.org')) return null;

                const downloadInfo = await resolveDriveseedLink(targetUrl);
                if (!downloadInfo || !downloadInfo.downloadOptions) return null;

                const { downloadOptions, title: fileTitle, size: fileSize } = downloadInfo;

                // Try each download method in order until we find a working one
                const preferredOrder = ['resume', 'worker', 'instant'];
                for (const type of preferredOrder) {
                    try {
                        const method = downloadOptions.find(opt => opt.type === type);
                        if (method) {
                            console.log(`[DramaDrip] Trying ${method.title} for ${linkInfo.quality}...`);
                            const finalLink = await resolveFinalLink(method);
                            
                            if (finalLink) {
                                // Validate the URL before using it
                                const isValid = await validateVideoUrl(finalLink);
                                if (isValid) {
                                    console.log(`[DramaDrip] ✓ Successfully resolved ${linkInfo.quality} using ${method.title}`);
                                    return {
                                        name: `DramaDrip - ${linkInfo.quality.split('(')[0].trim()}`,
                                        title: `${fileTitle || "Unknown Title"}\n${fileSize || 'Unknown Size'}`,
                                        url: finalLink,
                                        quality: linkInfo.quality,
                                        size: fileSize || '0'
                                    };
                                } else {
                                    console.log(`[DramaDrip] ✗ ${method.title} returned invalid/broken URL, trying next method...`);
                                }
                            } else {
                                console.log(`[DramaDrip] ✗ ${method.title} failed to resolve URL, trying next method...`);
                            }
                        }
                    } catch (error) {
                        console.log(`[DramaDrip] ✗ ${type} method threw error: ${error.message}, trying next method...`);
                    }
                }
                
                console.log(`[DramaDrip] ✗ All download methods failed for ${linkInfo.quality}`);
                return null;
            } catch (e) {
                console.error(`[DramaDrip] Error in stream promise: ${e.message}`);
                return null;
            }
        });

        let streams = (await Promise.all(streamPromises)).filter(Boolean);
        console.log(`[DramaDrip] Found ${streams.length} streams.`);
        
        // Sort streams by size, then quality before returning
        streams.sort((a, b) => {
            const sizeA = parseSize(a.size);
            const sizeB = parseSize(b.size);
            if (sizeB !== sizeA) {
                return sizeB - sizeA;
            }
            const qualityA = parseQuality(a.quality);
            const qualityB = parseQuality(b.quality);
            return qualityB - qualityA;
        });

        return streams;

    } catch (error) {
        console.error(`[DramaDrip] Error in getDramaDripStreams: ${error.message}`);
        return [];
    }
}

module.exports = { getDramaDripStreams }; 