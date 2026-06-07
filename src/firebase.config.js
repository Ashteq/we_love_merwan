// ╔══════════════════════════════════════════════════════════════════╗
// ║  we_love_merwan — Firebase Client Configuration                  ║
// ║  Pure client-side Firestore access (no backend required)         ║
// ╚══════════════════════════════════════════════════════════════════╝

import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, serverTimestamp, query, orderBy } from "firebase/firestore";

// Your actual Firebase project credentials
const firebaseConfig = {
  apiKey: "AIzaSyD6ai8ws2MCDBH_F1i-C7Ipigrw1srBNhU",
  authDomain: "welovemerwan.firebaseapp.com",
  projectId: "welovemerwan",
  storageBucket: "welovemerwan.firebasestorage.app",
  messagingSenderId: "971420965187",
  appId: "1:971420965187:web:e3816cbcdc4f87c52337f6",
  measurementId: "G-SFFZTYWJQ7"
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