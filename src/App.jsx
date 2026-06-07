// ╔══════════════════════════════════════════════════════════════════╗
// ║  we_love_merwan — App.jsx                                       ║
// ║  Pure client-side: Spotify PKCE + Firebase Firestore            ║
// ║  Retro Pop-Art aesthetic                                         ║
// ╚══════════════════════════════════════════════════════════════════╝

import { useState, useEffect, useRef, useCallback } from "react";
import { saveReview, fetchReviews } from "./firebase.config.js";

// ── ⚠️  REPLACE WITH YOUR SPOTIFY APP CREDENTIALS ─────────────────
// Dashboard: https://developer.spotify.com/dashboard
// Set Redirect URI to:  https://<your-github-username>.github.io/<repo-name>/
const SPOTIFY_CLIENT_ID = "YOUR_SPOTIFY_CLIENT_ID_HERE";
const REDIRECT_URI      = window.location.origin + window.location.pathname;
const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
].join(" ");

// ── PKCE Helpers ───────────────────────────────────────────────────

/** Generate a cryptographically random code verifier (43-128 chars). */
function generateCodeVerifier(length = 128) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join("");
}

/** SHA-256 hash a string, return as base64url. */
async function sha256(plain) {
  const encoder = new TextEncoder();
  const data    = encoder.encode(plain);
  const digest  = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Redirect the browser to Spotify's authorization page with PKCE params. */
async function redirectToSpotifyAuth() {
  const verifier  = generateCodeVerifier();
  const challenge = await sha256(verifier);

  sessionStorage.setItem("pkce_code_verifier", verifier);

  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("client_id",             SPOTIFY_CLIENT_ID);
  url.searchParams.set("response_type",         "code");
  url.searchParams.set("redirect_uri",          REDIRECT_URI);
  url.searchParams.set("scope",                 SCOPES);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge",        challenge);

  window.location.href = url.toString();
}

/** Exchange the authorization code for tokens — client-side only, no secret. */
async function exchangeCodeForToken(code) {
  const verifier = sessionStorage.getItem("pkce_code_verifier");
  if (!verifier) throw new Error("PKCE verifier missing from sessionStorage.");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     SPOTIFY_CLIENT_ID,
      grant_type:    "authorization_code",
      code,
      redirect_uri:  REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error_description || "Token exchange failed.");
  }

  const data = await res.json();
  sessionStorage.removeItem("pkce_code_verifier");
  // Store with expiry timestamp
  const expiry = Date.now() + data.expires_in * 1000;
  localStorage.setItem("spotify_access_token",  data.access_token);
  localStorage.setItem("spotify_refresh_token", data.refresh_token || "");
  localStorage.setItem("spotify_token_expiry",  String(expiry));
  return data.access_token;
}

/** Refresh access token using the stored refresh token. */
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("spotify_refresh_token");
  if (!refreshToken) return null;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     SPOTIFY_CLIENT_ID,
      grant_type:    "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    localStorage.removeItem("spotify_access_token");
    localStorage.removeItem("spotify_refresh_token");
    localStorage.removeItem("spotify_token_expiry");
    return null;
  }

  const data   = await res.json();
  const expiry = Date.now() + data.expires_in * 1000;
  localStorage.setItem("spotify_access_token",  data.access_token);
  if (data.refresh_token) {
    localStorage.setItem("spotify_refresh_token", data.refresh_token);
  }
  localStorage.setItem("spotify_token_expiry", String(expiry));
  return data.access_token;
}

/** Get a valid access token, refreshing if needed. */
async function getValidToken() {
  const expiry = Number(localStorage.getItem("spotify_token_expiry") || 0);
  const token  = localStorage.getItem("spotify_access_token");
  if (!token) return null;
  if (Date.now() > expiry - 60_000) {
    return await refreshAccessToken();
  }
  return token;
}

/** Logout: clear all stored tokens. */
function logout() {
  localStorage.removeItem("spotify_access_token");
  localStorage.removeItem("spotify_refresh_token");
  localStorage.removeItem("spotify_token_expiry");
  window.location.href = REDIRECT_URI;
}

// ── Utility Helpers ────────────────────────────────────────────────

function msToTime(ms) {
  if (!ms || isNaN(ms)) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = String(totalSec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// ── Sub-components ─────────────────────────────────────────────────

/** 8-bit pixel heart row — fills based on value 0-5. */
function PixelHearts({ value = 5, max = 5, color = "var(--pink-500)" }) {
  return (
    <div className="pixel-hearts">
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={`pixel-heart ${i < value ? "" : "empty"}`}
          style={{ "--heart-color": color }}
        />
      ))}
    </div>
  );
}

/** Star rating selector. */
function StarRating({ value, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`star-btn ${n <= (hover || value) ? "active" : ""}`}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          ♥
        </button>
      ))}
      <span style={{ fontFamily: "var(--font-pixel)", fontSize: "0.42rem", marginLeft: 4 }}>
        {value}/5
      </span>
    </div>
  );
}

/** Animated floating hearts background layer. */
function HeartsBackground() {
  return (
    <div className="hearts-bg" aria-hidden="true">
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} className="heart-particle">♥</div>
      ))}
    </div>
  );
}

/** ATTENTION! retro login popup. */
function LoginScreen({ onLogin }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: 20,
        position: "relative",
        zIndex: 1,
      }}
    >
      {/* Title */}
      <div className="app-header">
        <h1 className="app-title">
          <span className="pulse-heart">♥</span>
          {" "}WE_LOVE_MERWAN{" "}
          <span className="pulse-heart">♥</span>
        </h1>
        <p className="app-subtitle">a musical love letter</p>
      </div>

      {/* Attention popup */}
      <div className="alert-popup">
        <div className="alert-popup__header">
          <div className="alert-popup__header-icon">!</div>
          <span className="alert-popup__title">⚠ ATTENTION !</span>
        </div>
        <div className="alert-popup__body">
          <p>
            YOU NEED A{" "}
            <span style={{ color: "var(--pink-600)", fontWeight: 900 }}>
              SPOTIFY PREMIUM
            </span>{" "}
            ACCOUNT<br />
            TO USE THIS APP.<br />
            <br />
            CLICK START TO LOG IN VIA<br />
            SECURE PKCE FLOW ♥<br />
            <br />
            (NO SERVER. NO SECRET. JUST LOVE.)
          </p>

          {/* Pixel hearts decoration */}
          <PixelHearts value={5} max={5} />

          <div className="mt-16">
            <button className="btn-pixel btn-start" onClick={onLogin}>
              ♥ START ♥
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Spotify Web Playback SDK Player Panel. */
function PlayerPanel({ token, onTrackChange }) {
  const [player, setPlayer]             = useState(null);
  const [deviceId, setDeviceId]         = useState(null);
  const [isReady, setIsReady]           = useState(false);
  const [playerState, setPlayerState]   = useState(null);
  const [position, setPosition]         = useState(0);
  const [volume, setVolume]             = useState(5); // 0-5 hearts
  const intervalRef                     = useRef(null);

  // Load Spotify Web Playback SDK script
  useEffect(() => {
    if (window.Spotify) {
      initPlayer();
      return;
    }

    window.onSpotifyWebPlaybackSDKReady = initPlayer;

    const script = document.createElement("script");
    script.src   = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function initPlayer() {
    const p = new window.Spotify.Player({
      name:  "♥ we_love_merwan ♥",
      getOAuthToken: (cb) => cb(token),
      volume: 0.8,
    });

    p.addListener("ready", ({ device_id }) => {
      setDeviceId(device_id);
      setIsReady(true);
    });

    p.addListener("not_ready", () => setIsReady(false));

    p.addListener("player_state_changed", (state) => {
      if (!state) return;
      setPlayerState(state);
      setPosition(state.position);

      const track = state.track_window?.current_track;
      if (track) {
        onTrackChange({
          id:       track.id,
          name:     track.name,
          artist:   track.artists.map((a) => a.name).join(", "),
          albumArt: track.album?.images?.[0]?.url || null,
          duration: state.duration,
        });
      }
    });

    p.connect();
    setPlayer(p);

    return () => {
      p.disconnect();
      clearInterval(intervalRef.current);
    };
  }

  // Live position ticker
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (playerState && !playerState.paused) {
      const startTime = Date.now();
      const startPos  = playerState.position;
      intervalRef.current = setInterval(() => {
        setPosition(startPos + (Date.now() - startTime));
      }, 500);
    }
    return () => clearInterval(intervalRef.current);
  }, [playerState]);

  const isPaused  = playerState?.paused ?? true;
  const duration  = playerState?.duration ?? 0;
  const progress  = duration > 0 ? Math.min((position / duration) * 100, 100) : 0;

  const track = playerState?.track_window?.current_track;

  async function handleVolumeClick(level) {
    setVolume(level);
    if (player) await player.setVolume(level / 5);
  }

  async function seek(e) {
    if (!player || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = (e.clientX - rect.left) / rect.width;
    const ms   = Math.floor(pct * duration);
    await player.seek(ms);
    setPosition(ms);
  }

  return (
    <div className="window">
      <div className="window-titlebar">
        <div className="window-dots">
          <div className="window-dot" />
          <div className="window-dot" />
          <div className="window-dot" />
        </div>
        <span>♥ NOW PLAYING ♥</span>
        {isReady && (
          <span className="connected-badge">
            <span className="connected-dot" />
            SDK READY
          </span>
        )}
      </div>

      <div className="window-body">
        {/* Pop-art bordered player block */}
        <div
          className="pop-border"
          style={{ padding: 16, background: "var(--pink-100)" }}
        >
          <span className="corner-br" />
          <span className="corner-bl" />

          {/* Album Art */}
          <div className="album-art-wrapper">
            {track?.album?.images?.[0]?.url ? (
              <img
                src={track.album.images[0].url}
                alt={track.name}
                className="album-art"
              />
            ) : (
              <div className="album-art-placeholder">♥</div>
            )}
          </div>

          {/* Track Info */}
          <div className="track-info">
            <div className="track-name">
              {track?.name ?? "— no track loaded —"}
            </div>
            <div className="track-artist">
              {track?.artists?.map((a) => a.name).join(", ") ?? ""}
            </div>
          </div>

          {/* Progress bar */}
          <div className="progress-container">
            <span className="progress-time">{msToTime(position)}</span>
            <div
              className="progress-bar-outer"
              style={{ cursor: "pointer" }}
              onClick={seek}
              role="slider"
              aria-label="Track progress"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="progress-bar-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="progress-time">{msToTime(duration)}</span>
          </div>

          {/* Controls */}
          <div className="player-controls">
            <button
              className="btn-pixel btn-back"
              onClick={() => player?.previousTrack()}
              disabled={!isReady}
              title="Previous"
            >
              ◀◀ BACK
            </button>

            <button
              className={`btn-pixel ${isPaused ? "btn-start" : "btn-end"}`}
              onClick={() => player?.togglePlay()}
              disabled={!isReady}
            >
              {isPaused ? "▶ PLAY" : "⏸ PAUSE"}
            </button>

            <button
              className="btn-pixel btn-next"
              onClick={() => player?.nextTrack()}
              disabled={!isReady}
              title="Next"
            >
              NEXT ▶▶
            </button>
          </div>

          {/* Volume as pixel hearts */}
          <div className="volume-row">
            <span className="volume-label">VOL:</span>
            <div className="volume-hearts">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => handleVolumeClick(n)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                  title={`Volume ${n}/5`}
                  aria-label={`Set volume to ${n}`}
                >
                  <span
                    className={`pixel-heart ${n <= volume ? "" : "empty"}`}
                    style={{
                      "--heart-color": "var(--pink-600)",
                      display: "inline-block",
                      width: 12,
                      height: 12,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Playback device info */}
        {!isReady && (
          <p
            style={{
              fontFamily: "var(--font-pixel)",
              fontSize: "0.42rem",
              textAlign: "center",
              color: "var(--pink-500)",
              marginTop: 12,
              lineHeight: 2.5,
            }}
          >
            <span className="pixel-spinner" style={{ display: "block", margin: "0 auto 8px" }} />
            INITIALIZING SPOTIFY PLAYER...
          </p>
        )}
        {isReady && !track && (
          <p
            style={{
              fontFamily: "var(--font-pixel)",
              fontSize: "0.42rem",
              textAlign: "center",
              color: "var(--pink-400)",
              marginTop: 12,
              lineHeight: 2.5,
            }}
          >
            OPEN SPOTIFY → SELECT A TRACK →<br />
            CHOOSE "♥ we_love_merwan ♥" AS DEVICE ♥
          </p>
        )}
      </div>
    </div>
  );
}

/** Review submission + display panel. */
function ReviewPanel({ currentTrack, userProfile }) {
  const [reviews, setReviews]     = useState([]);
  const [rating, setRating]       = useState(5);
  const [comment, setComment]     = useState("");
  const [submitting, setSubmit]   = useState(false);
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchReviews()
      .then((data) => { if (!cancelled) setReviews(data); })
      .catch(() => showToast("COULD NOT LOAD REVIEWS :("))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [showToast]);

  async function handleSubmit() {
    if (!comment.trim()) {
      showToast("WRITE SOMETHING FIRST ♥");
      return;
    }
    setSubmit(true);
    try {
      await saveReview({
        trackId:     currentTrack?.id    ?? "unknown",
        trackName:   currentTrack?.name  ?? "Unknown Track",
        artist:      currentTrack?.artist ?? "Unknown Artist",
        rating,
        comment:     comment.trim(),
        userId:      userProfile?.id   ?? "anon",
        displayName: userProfile?.display_name ?? "Anonymous Listener",
      });
      setComment("");
      setRating(5);
      showToast("REVIEW SAVED ♥ THANK YOU!");
      // Refresh reviews
      const updated = await fetchReviews();
      setReviews(updated);
    } catch (err) {
      console.error(err);
      showToast("SAVE FAILED — CHECK FIREBASE CONFIG");
    } finally {
      setSubmit(false);
    }
  }

  return (
    <>
      {/* Review form */}
      <div className="window">
        <div className="window-titlebar">
          <div className="window-dots">
            <div className="window-dot" />
            <div className="window-dot" />
            <div className="window-dot" />
          </div>
          <span>♥ LEAVE A REVIEW ♥</span>
          {currentTrack?.name && (
            <span
              style={{
                fontFamily: "var(--font-hand)",
                fontSize: "0.85rem",
                maxWidth: 160,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {currentTrack.name}
            </span>
          )}
        </div>

        <div className="window-body">
          {/* Pop-art bordered review box */}
          <div
            className="pop-border"
            style={{ padding: 16, background: "var(--cream)" }}
          >
            <span className="corner-br" />
            <span className="corner-bl" />

            <div className="review-form">
              <div>
                <label className="form-label">RATING:</label>
                <StarRating value={rating} onChange={setRating} />
              </div>
              <div>
                <label className="form-label" htmlFor="review-comment">
                  YOUR THOUGHTS:
                </label>
                <textarea
                  id="review-comment"
                  className="form-textarea"
                  placeholder="Write your heart out... ♥"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={500}
                />
                <span
                  style={{
                    fontFamily: "var(--font-pixel)",
                    fontSize: "0.38rem",
                    color: "var(--pink-400)",
                    display: "block",
                    textAlign: "right",
                    marginTop: 2,
                  }}
                >
                  {comment.length}/500
                </span>
              </div>

              {currentTrack?.name && (
                <div
                  style={{
                    fontFamily: "var(--font-pixel)",
                    fontSize: "0.42rem",
                    color: "var(--pink-600)",
                    textAlign: "center",
                    lineHeight: 2,
                  }}
                >
                  REVIEWING: {currentTrack.name}
                </div>
              )}

              <button
                className="btn-pixel btn-submit"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? "SAVING..." : "♥ SUBMIT REVIEW ♥"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Reviews feed */}
      <div className="window mt-8">
        <div className="window-titlebar">
          <div className="window-dots">
            <div className="window-dot" />
            <div className="window-dot" />
            <div className="window-dot" />
          </div>
          <span>♥ ALL REVIEWS ♥</span>
          <span style={{ fontFamily: "var(--font-pixel)", fontSize: "0.4rem" }}>
            {reviews.length} TOTAL
          </span>
        </div>

        <div className="window-body">
          {loading ? (
            <div style={{ textAlign: "center", padding: 20 }}>
              <span className="pixel-spinner" style={{ display: "inline-block" }} />
            </div>
          ) : reviews.length === 0 ? (
            <div className="no-reviews">
              NO REVIEWS YET.<br />
              BE THE FIRST TO WRITE ONE! ♥
            </div>
          ) : (
            <div className="reviews-feed">
              {reviews.map((r) => (
                <div key={r.id} className="review-card">
                  <div className="review-card__header">
                    <span className="review-card__user">
                      {r.displayName ?? "Anonymous"}
                    </span>
                    <span className="review-card__track">
                      {r.trackName ?? ""}
                    </span>
                    <span className="review-card__stars">
                      {"♥".repeat(r.rating ?? 0)}{"♡".repeat(5 - (r.rating ?? 0))}
                    </span>
                  </div>
                  <p className="review-card__comment">{r.comment}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </>
  );
}

// ── Main App Component ─────────────────────────────────────────────

export default function App() {
  const [token, setToken]               = useState(null);
  const [userProfile, setUserProfile]   = useState(null);
  const [authError, setAuthError]       = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [authLoading, setAuthLoading]   = useState(true);

  // ── On mount: check URL for auth code or stored token ─────────
  useEffect(() => {
    async function handleAuth() {
      const params = new URLSearchParams(window.location.search);
      const code   = params.get("code");
      const error  = params.get("error");

      if (error) {
        setAuthError(`Spotify auth error: ${error}`);
        setAuthLoading(false);
        return;
      }

      if (code) {
        // Remove code from URL (clean history)
        window.history.replaceState({}, "", window.location.pathname);
        try {
          const t = await exchangeCodeForToken(code);
          setToken(t);
          await loadUserProfile(t);
        } catch (e) {
          setAuthError(e.message);
        } finally {
          setAuthLoading(false);
        }
        return;
      }

      // Try using stored token
      const existing = await getValidToken();
      if (existing) {
        setToken(existing);
        await loadUserProfile(existing);
      }
      setAuthLoading(false);
    }

    handleAuth();
  }, []);

  async function loadUserProfile(t) {
    try {
      const res  = await fetch("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) throw new Error("Failed to fetch profile");
      const data = await res.json();
      setUserProfile(data);
    } catch {
      // Non-fatal; app still works without profile data
    }
  }

  const isLoggedIn = Boolean(token);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <>
      {/* Floating hearts layer — always behind everything */}
      <HeartsBackground />

      {/* Watermark + signature — fixed bottom-right */}
      <div className="watermark-block" aria-hidden="true">
        <span className="watermark-text">I LOVE MERWAN, BUT HE LWKY GAY.</span>
        <span className="signature-text">BY A.Sh</span>
      </div>

      {/* ── AUTH LOADING ─────────────────────────────────────── */}
      {authLoading && (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 16,
            position: "relative",
            zIndex: 1,
          }}
        >
          <span className="pixel-spinner" />
          <p
            style={{
              fontFamily: "var(--font-pixel)",
              fontSize: "0.5rem",
              color: "var(--pink-600)",
            }}
          >
            CONNECTING...
          </p>
        </div>
      )}

      {/* ── AUTH ERROR ───────────────────────────────────────── */}
      {!authLoading && authError && (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            zIndex: 1,
            padding: 20,
          }}
        >
          <div className="alert-popup">
            <div className="alert-popup__header" style={{ background: "#cc0000" }}>
              <div className="alert-popup__header-icon">X</div>
              <span className="alert-popup__title">AUTH ERROR</span>
            </div>
            <div className="alert-popup__body">
              <p>{authError}</p>
              <button
                className="btn-pixel btn-danger"
                onClick={() => {
                  setAuthError(null);
                  setAuthLoading(false);
                }}
              >
                TRY AGAIN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── NOT LOGGED IN ────────────────────────────────────── */}
      {!authLoading && !authError && !isLoggedIn && (
        <LoginScreen onLogin={redirectToSpotifyAuth} />
      )}

      {/* ── LOGGED IN — MAIN APP ─────────────────────────────── */}
      {!authLoading && !authError && isLoggedIn && (
        <div className="app-shell">
          {/* Header */}
          <div className="app-header">
            <h1 className="app-title">
              <span className="pulse-heart">♥</span>
              {" "}WE_LOVE_MERWAN{" "}
              <span className="pulse-heart">♥</span>
            </h1>
            <p className="app-subtitle">a musical love letter</p>
          </div>

          {/* User bar */}
          {userProfile && (
            <div
              className="card"
              style={{ maxWidth: 680, padding: "10px 16px" }}
            >
              <div
                className="flex items-center justify-between flex-wrap gap-8"
              >
                <div
                  className="flex items-center gap-8"
                >
                  {userProfile.images?.[0]?.url && (
                    <img
                      src={userProfile.images[0].url}
                      alt={userProfile.display_name}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        border: "3px solid var(--black)",
                        objectFit: "cover",
                      }}
                    />
                  )}
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--font-pixel)",
                        fontSize: "0.45rem",
                        color: "var(--dark)",
                      }}
                    >
                      LOGGED IN AS:
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-hand)",
                        fontSize: "1.1rem",
                        color: "var(--pink-700)",
                      }}
                    >
                      {userProfile.display_name}
                    </div>
                  </div>
                </div>
                <button
                  className="btn-pixel btn-end"
                  onClick={logout}
                  style={{ fontSize: "0.4rem" }}
                >
                  LOGOUT ♥
                </button>
              </div>
            </div>
          )}

          {/* Player */}
          <PlayerPanel token={token} onTrackChange={setCurrentTrack} />

          <div className="divider" />

          {/* Reviews */}
          <ReviewPanel
            currentTrack={currentTrack}
            userProfile={userProfile}
          />
        </div>
      )}
    </>
  );
}
