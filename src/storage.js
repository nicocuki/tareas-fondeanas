import { isFirebaseConfigured } from './firebaseConfig.js';
import * as firebaseBackend from './storage-firebase.js';
import * as localBackend from './storage-local.js';

export const backend = isFirebaseConfigured ? firebaseBackend : localBackend;
