import { getApps, initializeApp } from 'firebase/app';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import { firebaseConfig } from './firebaseConfig.js';
export const firebaseApp = () => getApps()[0] || initializeApp(firebaseConfig);
let connected = false;
export function database() {
  const db = getDatabase(firebaseApp());
  if (import.meta.env?.VITE_FIREBASE_EMULATORS === 'true' && !connected) { connectDatabaseEmulator(db, '127.0.0.1', 9000); connected = true; }
  return db;
}
