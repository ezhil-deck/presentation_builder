import { renderToStaticMarkup } from 'react-dom/server';
import App from '../src/App.jsx';

describe('@pb/ui', () => {
  it('exports the App component', () => {
    expect(typeof App).toBe('function');
  });

  it('renders the Studio by default (the review console moved to #/review)', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('data-testid="studio"');
    expect(html).toContain('Loading brands');
  });
});
