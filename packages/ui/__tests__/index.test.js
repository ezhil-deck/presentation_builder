import { renderToStaticMarkup } from 'react-dom/server';
import App from '../src/App.jsx';

describe('@pb/ui', () => {
  it('exports the App component', () => {
    expect(typeof App).toBe('function');
  });

  it('renders the placeholder', () => {
    expect(renderToStaticMarkup(<App />)).toContain('presentation_builder');
  });
});
