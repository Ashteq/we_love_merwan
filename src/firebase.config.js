// ╔══════════════════════════════════════════════════════════════════╗
// ║  we_love_merwan — Firebase Client Configuration                 ║
// ║  Pure client-side Firestore access (no backend required)        ║
// ║  Replace the values below with your own Firebase project config  ║
// ╚══════════════════════════════════════════════════════════════════╝

import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, serverTimestamp, query, orderBy } from "firebase/firestore";

// ⚠️  REPLACE THESE WITH YOUR REAL FIREBASE PROJECT CREDENTIALS
// Go to: Firebase Console → Project Settings → Your Apps → SDK setup
const firebaseConfig = {
  apiKey:            "AIzaSy-REPLACE-WITH-YOUR-KEY",
  authDomain:        "your-project-id.firebaseapp.com",
  projectId:         "your-project-id",
  storageBucket:     "your-project-id.appspot.com",
  messagingSenderId: "000000000000",
  appId:             "1:000000000000:web:0000000000000000000000",
};

// Initialize Firebase app (safe to call multiple times in dev with HMR)
const app = initializeApp(firebaseConfig);

// Firestore database instance
export const db = getFirestore(app);

// ── Firestore helpers ──────────────────────────────────────────────

/**
 * Save a new review document to the "reviews" collection.
 * @param {{ trackId: string, trackName: string, artist: string, rating: number, comment: string, userId: string, displayName: string }} review
 * @returns {Promise<string>} The new document ID
 */
export async function saveReview(review) {
  const docRef = await addDoc(collection(db, "reviews"), {
    ...review,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Fetch all reviews from Firestore, newest first.
 * @returns {Promise<Array>}
 */
export async function fetchReviews() {
  const q = query(collection(db, "reviews"), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Fetch reviews for a specific track.
 * @param {string} trackId  Spotify track ID
 * @returns {Promise<Array>}
 */
export async function fetchReviewsForTrack(trackId) {
  const all = await fetchReviews();
  return all.filter((r) => r.trackId === trackId);
}
