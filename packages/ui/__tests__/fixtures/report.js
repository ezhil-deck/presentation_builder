// A Report v1 (P3-spec §A.1) for the component tests, pointing at real elements of golden/expected/stripe/deck.json.
export function reportV1(deck) {
  const s4 = deck.slides[3];
  const title = s4.elements.find((e) => e.role === 'title') ?? s4.elements[0];
  const body = s4.elements.find((e) => e.id !== title.id && e.frame) ?? s4.elements[1];
  return {
    kind: 'Report',
    version: '1.0.0',
    brandId: 'stripe',
    deckId: deck.id,
    engineVersion: deck.engineVersion,
    summary: { checks: 4, pass: 1, warn: 2, fail: 1, skip: 0, items: { fail: 1, warn: 2, info: 1 } },
    results: [
      { id: 'schema', title: 'Deck matches the schema', status: 'pass', signal: 'none', count: 0, items: [] },
      {
        id: 'margins',
        title: 'Inside the margins',
        status: 'warn',
        signal: 'mood.geometry.margins',
        count: 1,
        items: [
          {
            severity: 'warn',
            slide: s4.id,
            index: 4,
            elementId: title.id,
            message: 'title is 12 px outside on the left',
          },
        ],
      },
      {
        id: 'contrast',
        title: 'Text contrast',
        status: 'fail',
        signal: 'surfaces',
        count: 2,
        items: [
          {
            severity: 'fail',
            slide: s4.id,
            index: 4,
            elementId: body.id,
            message: '#50617A on #FFFFFF is 3.9:1',
          },
          { severity: 'info', slide: deck.slides[0].id, index: 1, message: 'image background' },
        ],
      },
      {
        id: 'variety',
        title: 'Surface variety',
        status: 'warn',
        signal: 'palette.rhythm',
        count: 1,
        items: [{ severity: 'warn', message: 'six content slides in a row on "page"' }],
      },
    ],
  };
}
