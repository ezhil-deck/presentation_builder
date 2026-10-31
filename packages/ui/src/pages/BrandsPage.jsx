import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import BrandsTable from '../components/BrandsTable.jsx';

export default function BrandsPage() {
  const [brands, setBrands] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(
    () =>
      api
        .brands()
        .then((b) => {
          setBrands(b ?? []);
          setError(null);
        })
        .catch((err) => setError(err.message)),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const building = Boolean(brands?.some((b) => b.building));
  useEffect(() => {
    if (!building) return undefined;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [building, load]);

  const onBuild = async (id, png) => {
    try {
      await api.build(id, png);
    } catch (err) {
      setError(err.message);
    }
    load();
  };

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-5">
      <h1 className="mb-3 text-sm font-semibold text-neutral-900">Brands</h1>
      {error ? <p className="mb-2 text-xs text-red-700">{error}</p> : null}
      {brands ? (
        <BrandsTable brands={brands} onBuild={onBuild} />
      ) : (
        <p className="text-xs text-neutral-500">Loading…</p>
      )}
    </div>
  );
}
