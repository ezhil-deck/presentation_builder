import BrandPage from './pages/BrandPage.jsx';
import BrandsPage from './pages/BrandsPage.jsx';
import { useHashRoute } from './router.js';

/** The review UI (P3-spec §C.2): a hash-routed Brands list and Brand page. */
export default function App() {
  const route = useHashRoute();
  return (
    <div className="pb-ui min-h-screen bg-neutral-50 text-neutral-900">
      <div className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-9 max-w-[1600px] items-center gap-3 px-6 text-xs">
          <a href="#/" className="font-semibold tracking-tight text-neutral-900">
            presentation_builder
          </a>
          <span className="text-neutral-400">review</span>
        </div>
      </div>
      {route.page === 'brand' ? <BrandPage key={route.id} route={route} /> : <BrandsPage />}
    </div>
  );
}
