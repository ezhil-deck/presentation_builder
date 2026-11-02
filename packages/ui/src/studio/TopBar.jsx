// The Studio's top bar (docs/PLAN-studio.md §2): brand switcher, content switcher, slide counter with prev / next,
// zoom (fit / 50 / 100 %), guides, grid, Export, and the overflow menu (drawers, Reconvert, the review console).
import { cx } from '../lib/format.js';
import BrandSwitcher from './BrandSwitcher.jsx';
import { Icon, MenuItem, MenuSeparator, Popover, ToolButton } from './ui.jsx';

const ZOOMS = [
  ['fit', 'Fit'],
  [50, '50%'],
  [100, '100%'],
];

export default function TopBar({
  brands,
  brandId,
  contents,
  contentId,
  index,
  total,
  zoom,
  guides,
  grid,
  busy,
  exporting,
  onBrand,
  onContent,
  onStep,
  onZoom,
  onGuides,
  onGrid,
  onExport,
  onDrawer,
  onReconvert,
}) {
  const content = contents?.find((c) => c.id === contentId);
  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-zinc-200 bg-white px-2">
      <BrandSwitcher
        brands={brands}
        brandId={brandId}
        contentId={contentId}
        onPick={onBrand}
        disabled={busy}
      />
      <Popover
        label="Content"
        disabled={busy || !contents?.length}
        panelClass="w-72"
        trigger={
          <>
            <span className="max-w-[200px] truncate text-zinc-800" data-testid="content-current">
              {content?.title ?? 'Content'}
            </span>
            <Icon name="down" className="text-zinc-400" />
          </>
        }
      >
        {(close) => (
          <div role="menu">
            {(contents ?? []).map((c) => (
              <MenuItem
                key={c.id}
                hint={c.file}
                className={c.id === contentId ? 'bg-blue-50 text-blue-700' : undefined}
                onClick={() => {
                  close();
                  onContent(c.id);
                }}
              >
                {c.title}
              </MenuItem>
            ))}
            {contents?.length === 1 ? (
              <p className="px-2 py-1.5 text-xs text-zinc-400">Add decks as content/*.md</p>
            ) : null}
          </div>
        )}
      </Popover>

      <div className="mx-auto flex items-center gap-1" data-testid="counter">
        <ToolButton aria-label="Previous slide" disabled={busy || index <= 0} onClick={() => onStep(-1)}>
          <Icon name="left" />
        </ToolButton>
        <span className="min-w-[64px] text-center text-[13px] tabular-nums text-zinc-700">
          {total ? `${index + 1} / ${total}` : '—'}
        </span>
        <ToolButton aria-label="Next slide" disabled={busy || index >= total - 1} onClick={() => onStep(1)}>
          <Icon name="right" />
        </ToolButton>
      </div>

      <div className="flex items-center rounded-md bg-zinc-100 p-0.5" role="group" aria-label="Zoom">
        {ZOOMS.map(([z, label]) => (
          <button
            key={z}
            type="button"
            aria-pressed={zoom === z}
            onClick={() => onZoom(z)}
            className={cx(
              'h-7 rounded px-2 text-xs tabular-nums',
              zoom === z ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <ToolButton aria-pressed={guides} active={guides} onClick={() => onGuides(!guides)}>
        Guides
      </ToolButton>
      <ToolButton aria-pressed={grid} active={grid} title="Grid (G)" onClick={() => onGrid(!grid)}>
        Grid
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-zinc-200" />
      <Popover
        label="Export"
        align="right"
        panelClass="w-64"
        disabled={busy || !brandId}
        trigger={
          <>
            {exporting ? 'Exporting…' : 'Export'}
            <Icon name="down" className="text-zinc-400" />
          </>
        }
      >
        {(close) => (
          <div role="menu">
            <MenuItem
              disabled={exporting}
              hint="out/…/studio"
              onClick={() => {
                close();
                onExport({ pdf: true });
              }}
            >
              PDF
            </MenuItem>
            <MenuItem
              disabled={exporting}
              onClick={() => {
                close();
                onExport({ png: true });
              }}
            >
              PNG slides
            </MenuItem>
            <MenuItem
              disabled={exporting}
              onClick={() => {
                close();
                onExport({});
              }}
            >
              Deck JSON + HTML
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              disabled={exporting}
              hint="pb build"
              onClick={() => {
                close();
                onExport({ cli: true });
              }}
            >
              Showcase build + PNG
            </MenuItem>
          </div>
        )}
      </Popover>
      <Popover label="More" align="right" panelClass="w-56" trigger={<Icon name="more" />}>
        {(close) => (
          <div role="menu">
            {[
              ['questions', 'Questions'],
              ['report', 'Report'],
              ['diff', 'Diff'],
              ['checks', 'Checks'],
              ['mood', 'Mood'],
            ].map(([id, label]) => (
              <MenuItem
                key={id}
                onClick={() => {
                  close();
                  onDrawer(id);
                }}
              >
                {label}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem
              disabled={busy}
              onClick={() => {
                close();
                onReconvert();
              }}
            >
              Reconvert brand
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                window.location.hash = '#/review';
              }}
            >
              Review console
            </MenuItem>
          </div>
        )}
      </Popover>
    </header>
  );
}
