// Configuración web del proyecto de Firebase (no es secreta: la protegen las reglas de database.rules.json).
// Mientras databaseURL esté vacío, el juego usa el modo local (solo entre pestañas del mismo navegador).
export const firebaseConfig = {
  apiKey: 'AIzaSyC89f2iIdTKIlPtVapj2uDoRgVaXf9CWuQ',
  authDomain: 'secreto-aed7e.firebaseapp.com',
  databaseURL: 'https://secreto-aed7e-default-rtdb.firebaseio.com',
  projectId: 'secreto-aed7e',
  appId: '1:867926088614:web:da7c62e42c8b1c7ad68d67',
};

export const isFirebaseConfigured = Boolean(firebaseConfig.databaseURL);
