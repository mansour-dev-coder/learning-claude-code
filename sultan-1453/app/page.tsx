'use client';
// The main game screen: the 3D strategic map (src/client3d), mounted client-side only.
import { useEffect, useRef } from 'react';

export default function Page() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dispose = () => {};
    let cancelled = false;
    (async () => {
      const [{ mountGame }, { httpOracle, localStore }] = await Promise.all([import('../src/client3d/app'), import('../src/client3d/oracle')]);
      if (cancelled || !ref.current) return;
      const app = mountGame(ref.current, { oracle: httpOracle(), storage: localStore() });
      dispose = () => app.dispose();
    })();
    return () => { cancelled = true; dispose(); };
  }, []);
  return <div ref={ref} style={{ position: 'fixed', inset: 0 }} />;
}
