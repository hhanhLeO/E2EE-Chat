import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  generateIdentityKeyPair,
  exportPublicKey,
  exportPrivateKey,
  importPublicKey,
  importPrivateKey,
} from '../lib/crypto';
import { saveIdentity, loadIdentity } from '../lib/db';
import type { Identity } from '../types';

interface IdentityContextValue {
  identity: Identity | null;
  isLoading: boolean;
}

const IdentityContext = createContext<IdentityContextValue>({
  identity: null,
  isLoading: true,
});

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await loadIdentity();
        if (stored) {
          // Restore from IndexedDB
          const publicKey = await importPublicKey(stored.publicKeyRaw);
          const privateKey = await importPrivateKey(stored.privateKeyJwk);
          setIdentity({ publicKey, privateKey, publicKeyRaw: stored.publicKeyRaw });
        } else {
          // First visit — generate a new identity
          const keyPair = await generateIdentityKeyPair();
          const publicKeyRaw = await exportPublicKey(keyPair.publicKey);
          const privateKeyJwk = await exportPrivateKey(keyPair.privateKey);
          await saveIdentity(publicKeyRaw, privateKeyJwk);
          setIdentity({
            publicKey: keyPair.publicKey,
            privateKey: keyPair.privateKey,
            publicKeyRaw,
          });
        }
      } catch (err) {
        console.error('Identity init failed:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return (
    <IdentityContext.Provider value={{ identity, isLoading }}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  return useContext(IdentityContext);
}