import { getFirestore } from 'firebase/firestore';
import { app } from '@/lib/firebase';

// Separate from firebase.ts so pages that don't touch the database (landing, login)
// don't download the Firestore SDK. Import this only from code that needs the database.
export const db = getFirestore(app);
