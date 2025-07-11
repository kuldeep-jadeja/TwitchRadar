const { connectToDatabase } = require('../lib/mongodb');
const Streamer = require('../models/Streamer');
// const Clip = require('../models/Clip'); // optional: if you want to store clip URLs
const fs = require('fs/promises');
const fetch = (...args) => import('node-fetch').then(mod => mod.default(...args));
require('dotenv').config();
const { exec } = require('child_process');

function getAppAccessToken() {
    const client_id = process.env.TWITCH_CLIENT_ID;
    const client_secret = process.env.TWITCH_CLIENT_SECRET;

    const curlCommand = `curl -s -X POST "https://id.twitch.tv/oauth2/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=${client_id}" \
    -d "client_secret=${client_secret}" \
    -d "grant_type=client_credentials"`;

    return new Promise((resolve, reject) => {
        exec(curlCommand, (err, stdout) => {
            if (err) {
                console.error('Curl error:', err);
                return reject(new Error('Failed to get Twitch token'));
            }
            try {
                const { access_token } = JSON.parse(stdout);
                resolve(access_token);
            } catch (parseErr) {
                console.error('Failed to parse Twitch token response:', stdout);
                reject(new Error('Failed to parse Twitch token'));
            }
        });
    });
}

function shouldClip(stream, lastEntry, threshold = 1.1) {
    const current = stream.viewer_count;
    const last = lastEntry?.viewers || 1;
    const score = current / last;

    const viewDiff = current - last;
    const viewPercent = viewDiff / last;

    const title = stream.title.toLowerCase();
    const clickbait = /(insane|wtf|crazy|unbelievable|1v5|clutch|🔥|omg)/.test(title);

    const switchedGame = stream.game_name !== lastEntry?.game;
    const timeGap = new Date() - new Date(lastEntry?.timestamp || 0);

    return (
        (score >= threshold && viewPercent > 0.2) ||
        clickbait ||
        switchedGame ||
        timeGap > 15 * 60 * 1000
    );
}

async function createClip(broadcaster_id, token) {
    const res = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcaster_id}`, {
        method: 'POST',
        headers: {
            'Client-ID': process.env.TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Clip creation failed: ${res.status} - ${text}`);
    }

    const json = await res.json();
    return json.data[0]?.id || null;
}

(async () => {
    console.log('[🤖] Starting Smart Clipping Bot...');

    if (!process.env.MONGODB_URI) {
        console.error('❌ MONGODB_URI not found in environment variables!');
        process.exit(1);
    }

    try {
        await connectToDatabase();
        console.log('✅ Connected to MongoDB');
        const token = await getAppAccessToken();

        const whitelistRaw = await fs.readFile('./clip_data/whitelist.json', 'utf-8');
        const whitelist = JSON.parse(whitelistRaw);
        if (!whitelist.enabled) {
            console.log('[⛔] Bot is disabled.');
            return;
        }

        const liveRes = await fetch('https://api.twitch.tv/helix/streams?first=100', {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`,
            },
        });

        const twitchJson = await liveRes.json();
        const liveStreams = twitchJson.data;

        if (!Array.isArray(liveStreams)) {
            console.error('❌ Unexpected Twitch API response:', twitchJson);
            return;
        }

        for (const entry of whitelist.streamers) {
            const stream = liveStreams.find(
                (s) => s.user_name.toLowerCase() === entry.name.toLowerCase()
            );

            if (!stream) continue;

            const lastEntry = await Streamer.findOne({ name: stream.user_name }).sort({ timestamp: -1 });

            const threshold = entry.threshold || whitelist.default_threshold || 1.1;

            if (shouldClip(stream, lastEntry, threshold)) {
                try {
                    const clipId = await createClip(stream.user_id, token);
                    if (!clipId) {
                        console.warn(`[⚠️] Clip failed for ${stream.user_name}`);
                        continue;
                    }

                    const clipUrl = `https://clips.twitch.tv/${clipId}`;
                    console.log(`[📸] Clipped ${stream.user_name} ➜ ${clipUrl}`);

                    // Save current snapshot
                    await Streamer.create({
                        name: stream.user_name,
                        game: stream.game_name,
                        title: stream.title,
                        viewers: stream.viewer_count,
                        score: (stream.viewer_count / (lastEntry?.viewers || 1)).toFixed(2),
                        timestamp: new Date(),
                    });

                    // Optional: save the clip itself
                    // await Clip.create({ streamer: stream.user_name, url: clipUrl, timestamp: new Date() });

                } catch (err) {
                    console.error(`❌ Error while clipping ${stream.user_name}:`, err.message);
                }
            }
        }

        console.log('[✅] Done. Waiting for next run...');
    } catch (error) {
        console.error('❌ SmartClipBot encountered an error:', error.message);
    }
})();
