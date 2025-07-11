"use client";

import StreamerCard from "../components/StreamerCard";
import ViewerChart from "../components/ViewerChart";
import { useEffect, useState } from "react";

export default function Home() {
  const [streams, setStreams] = useState([]);
  const [selectedStreamer, setSelectedStreamer] = useState(null);
  const [selectedHistory, setSelectedHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("viewers");
  const [clipWorthyOnly, setClipWorthyOnly] = useState(false);
  const [selectedGame, setSelectedGame] = useState("All Games");

  const [lookupResult, setLookupResult] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState(null);

  const games = ["All Games", ...new Set(streams.map((s) => s.game))];

  const handleStreamerClick = async (streamer) => {
    setSelectedStreamer(streamer);
    setHistoryLoading(true);
    setSelectedHistory([]);

    try {
      const res = await fetch(`/api/streamer-history?name=${encodeURIComponent(streamer.name)}`);
      if (!res.ok) throw new Error("Failed to fetch history");
      const data = await res.json();
      setSelectedHistory(data);
    } catch (err) {
      console.error("Error fetching history:", err);
      setSelectedHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedStreamer(null);
    setSelectedHistory([]);
    setHistoryLoading(false);
  };

  const handleGlobalSearch = async () => {
    if (!searchTerm || searchTerm.length < 2) return;

    setLookupLoading(true);
    setLookupResult(null);
    setLookupError(null);

    try {
      const res = await fetch(`/api/lookup?name=${encodeURIComponent(searchTerm)}`);
      if (!res.ok) throw new Error("Streamer not found");
      const data = await res.json();
      setLookupResult(data);
    } catch (err) {
      setLookupError("Streamer not found or Twitch API error.");
    } finally {
      setLookupLoading(false);
    }
  };

  useEffect(() => {
    const fetchStreams = async () => {
      try {
        setError(null);
        const res = await fetch("/api/streams");
        if (!res.ok) throw new Error("Failed to fetch streams");
        const data = await res.json();
        setStreams(data);
      } catch (err) {
        console.error("Error fetching streams:", err);
        setError("Failed to load streams. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchStreams();
    const interval = setInterval(fetchStreams, 60000);
    return () => clearInterval(interval);
  }, []);

  const filteredAndSortedStreams = streams
    .filter((stream) => {
      const matchesSearch =
        stream.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stream.game.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesGame = selectedGame === "All Games" || stream.game === selectedGame;
      const isClipWorthy = !clipWorthyOnly || Number(stream.clip_score) >= 1;

      return matchesSearch && matchesGame && isClipWorthy;
    })
    .sort((a, b) => {
      if (clipWorthyOnly) return Number(b.clip_score) - Number(a.clip_score);
      switch (sortBy) {
        case "viewers": return b.viewers - a.viewers;
        case "name": return a.name.localeCompare(b.name);
        case "game": return a.game.localeCompare(b.game);
        default: return 0;
      }
    });

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-6 py-8">

        {/* Controls */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search streamers or games..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-3 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>

          {/* Filter */}
          <select value={selectedGame} onChange={(e) => setSelectedGame(e.target.value)}
            className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
            {games.map((game) => <option key={game}>{game}</option>)}
          </select>

          {/* Clip-worthy toggle */}
          <button onClick={() => setClipWorthyOnly(!clipWorthyOnly)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${clipWorthyOnly ? "bg-purple-600" : "bg-gray-300 dark:bg-gray-600"}`}>
            <span className={`inline-block h-4 w-4 transform bg-white rounded-full transition-transform ${clipWorthyOnly ? "translate-x-6" : "translate-x-1"}`} />
          </button>

          {/* Sort */}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
            <option value="viewers">Viewers</option>
            <option value="name">Name</option>
            <option value="game">Game</option>
          </select>
        </div>

        {/* 🔍 Global Lookup */}
        {filteredAndSortedStreams.length === 0 && (
          <div className="mt-4">
            <button onClick={handleGlobalSearch}
              className="text-sm text-purple-600 underline hover:text-purple-700">
              Can’t find the streamer? Try global search →
            </button>
          </div>
        )}

        {/* Global Lookup Result */}
        {lookupLoading && <p className="text-sm text-gray-500 mt-4">Looking up streamer...</p>}
        {lookupError && <p className="text-sm text-red-500 mt-4">{lookupError}</p>}
        {lookupResult && (
          <div className="mt-6 p-4 border rounded-lg bg-white dark:bg-gray-800">
            <div className="flex items-center gap-4">
              <img src={lookupResult.profile.profile_image_url} className="w-16 h-16 rounded-full" />
              <div>
                <h2 className="text-lg font-bold">{lookupResult.profile.display_name}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{lookupResult.profile.description}</p>
              </div>
              <span className={`ml-auto text-xs px-2 py-1 rounded-full ${lookupResult.live ? "bg-green-200 text-green-800" : "bg-gray-300 text-gray-700"}`}>
                {lookupResult.live ? "LIVE" : "Offline"}
              </span>
            </div>
            {lookupResult.live && (
              <div className="mt-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Playing <strong>{lookupResult.stream.game_name}</strong> • {lookupResult.stream.viewer_count} viewers
                </p>
                <p className="italic mt-1">{lookupResult.stream.title}</p>
                <a href={`https://twitch.tv/${lookupResult.profile.login}`} target="_blank"
                  className="mt-3 inline-block px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">
                  Watch Stream
                </a>
              </div>
            )}
          </div>
        )}

        {/* Streamers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-8">
          {filteredAndSortedStreams.map((stream, i) => (
            <StreamerCard key={i} {...stream} onClick={() => handleStreamerClick(stream)} />
          ))}
        </div>

        {/* Modal with ViewerChart */}
        {selectedStreamer && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-auto">
              <div className="flex justify-between mb-4">
                <h2 className="text-lg font-bold">{selectedStreamer.name} – {selectedStreamer.viewers} viewers</h2>
                <button onClick={closeModal}>✖</button>
              </div>
              {historyLoading ? (
                <p>Loading history...</p>
              ) : (
                <ViewerChart data={selectedHistory} />
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
