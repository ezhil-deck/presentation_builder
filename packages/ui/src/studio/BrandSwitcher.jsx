// The brand switcher (docs/PLAN-studio.md §2, §2.2): a popover of brand cards, each painting THAT brand's cover slide
// composed from the current content with our renderer at thumbnail size, plus the logo chip, the name and three
// colour dots - so a designer compares brands on the same slide. A brand the reader cannot derive is listed, disabled,
// with the reason.
import { useCallback, useState } from 'react';
import { brandFilesBase, studioApi } from '../api.js';
import { DeckStyle, ScaledSlide } from '../components/SlideCanvas.jsx';
import { cx } from '../lib/format.js';
import { ColourDots, Icon, LogoChip, Popover } from './ui.jsx';

export function BrandCard({ brand, cover, selected, onPick }) {
  const opts = { assetBase: brandFilesBase(brand.id), fontBase: brandFilesBase(brand.id) };
  const disabled = !brand.ok;
  return (
    <button
      type="button"
      data-testid="brand-card"
      data-brand={brand.id}
      disabled={disabled}
      onClick={() => onPick(brand.id)}
      className={cx(
        'block w-full rounded-md p-1.5 text-left disabled:cursor-not-allowed',
        selected ? 'bg-blue-50 ring-1 ring-inset ring-blue-600' : 'hover:bg-zinc-100',
      )}
    >
      <div className="overflow-hidden rounded-sm bg-zinc-100 ring-1 ring-zinc-200">
        {cover?.deck ? (
          <>
            <DeckStyle deck={cover.deck} fontBase={opts.fontBase} />
            <ScaledSlide deck={cover.deck} index={0} opts={opts} fallbackWidth={220} />
          </>
        ) : (
          <div className="flex aspect-video items-center justify-center px-3 text-center text-xs text-zinc-500">
            {disabled
              ? `Cannot derive${brand.questions?.blocking ? `: ${brand.questions.blocking} blocking question(s)` : ''}`
              : (cover?.error ?? 'Loading cover…')}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <LogoChip brand={brand} />
        <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-900">{brand.name}</span>
        <ColourDots colours={brand.colours} />
      </div>
    </button>
  );
}

export default function BrandSwitcher({ brands, brandId, contentId, onPick, disabled }) {
  const [covers, setCovers] = useState({}); // contentId -> {brandId -> cover}
  const [error, setError] = useState(null);
  const current = brands?.find((b) => b.id === brandId);

  const load = useCallback(() => {
    if (!contentId) return;
    setError(null);
    studioApi
      .covers(contentId)
      .then((list) =>
        setCovers((c) => ({
          ...c,
          [contentId]: Object.fromEntries((list ?? []).map((x) => [x.brandId, x])),
        })),
      )
      .catch((err) => setError(err.message));
  }, [contentId]);

  const byBrand = covers[contentId] ?? {};
  return (
    <Popover
      label="Brand"
      disabled={disabled || !brands?.length}
      onOpen={load}
      panelClass="w-[520px] max-h-[75vh] overflow-y-auto p-2"
      trigger={
        <>
          {current ? <LogoChip brand={current} /> : null}
          <span className="max-w-[160px] truncate font-medium text-zinc-900" data-testid="brand-current">
            {current?.name ?? 'Brand'}
          </span>
          <Icon name="down" className="text-zinc-400" />
        </>
      }
    >
      {(close) => (
        <div>
          <div className="flex h-8 items-center px-1.5 text-xs text-zinc-500">
            <span className="flex-1">Brands · the cover of the current content</span>
            <span className="tabular-nums">{brands?.length ?? 0}</span>
          </div>
          {error ? <p className="px-1.5 pb-2 text-xs text-red-700">{error}</p> : null}
          <div className="grid grid-cols-2 gap-1">
            {(brands ?? []).map((b) => (
              <BrandCard
                key={b.id}
                brand={b}
                cover={byBrand[b.id]}
                selected={b.id === brandId}
                onPick={(id) => {
                  close();
                  onPick(id);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}
