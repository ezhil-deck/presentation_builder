import BrandPage from './pages/BrandPage.jsx';
import BrandsPage from './pages/BrandsPage.jsx';
import { useHashRoute } from './router.js';
import Studio from './studio/Studio.jsx';

/**
 * The app: the Studio by default (docs/PLAN-studio.md §2: `#/`, `#/studio/...`); the P3 review console stays reachable
 * at `#/review` (Brands) and `#/b/<id>/...` (Brand pages).
 */
export default function App() {
  const route = useHashRoute();
  if (route.page === 'studio') return <Studio route={route} />;
  return (
    <div className="pb-ui min-h-screen bg-neutral-50 text-neutral-900">
      <div className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-9 max-w-[1600px] items-center gap-3 px-6 text-xs">
          <a href="#/review" className="font-semibold tracking-tight text-neutral-900">
            presentation_builder
          </a>
          <span className="text-neutral-400">review</span>
          <a href="#/" className="ml-auto text-neutral-600 hover:text-neutral-900">
            Studio →
          </a>
        </div>
      </div>
      {route.page === 'brand' ? <BrandPage key={route.id} route={route} /> : <BrandsPage />}
    </div>
  );
}
