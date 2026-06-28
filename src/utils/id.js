// Générateur d'id court non-cryptographique. Avant : dupliqué dans App.jsx et BaseModule.jsx.
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
