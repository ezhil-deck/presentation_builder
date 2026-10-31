import Ajv2020 from 'ajv/dist/2020.js';
import { load, readJson } from './fixtures.js';

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
const validate = ajv.compile(readJson('..', '..', '..', 'schemas', 'brand-spec.schema.json'));

describe('BrandSpec fixtures stay honest', () => {
  it.each(['stripe', 'minimal'])('%s validates against schemas/brand-spec.schema.json', (name) => {
    const ok = validate(load(name));
    expect(validate.errors).toBeNull();
    expect(ok).toBe(true);
  });

  it('minimal has 2 surfaces, 6 roles and no components/decor/motion/footer', () => {
    const m = load('minimal');
    expect(m.surfaces).toHaveLength(2);
    expect(Object.keys(m.typography.roles)).toHaveLength(6);
    for (const k of ['components', 'decor', 'motion']) expect(m[k]).toBeUndefined();
    expect(m.layout.footer).toBeUndefined();
  });
});
