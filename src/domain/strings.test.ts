import { expect, it } from 'vitest';
import { STRINGS, getT } from '../../public/assets/strings.js';
it('provides every Portuguese UI key and preserves interpolation arguments', () => {
  expect(Object.keys(STRINGS.pt).sort()).toEqual(Object.keys(STRINGS.de).sort());
  const placeholders=(value: unknown)=>[...String(value).matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
  for(const key of Object.keys(STRINGS.de) as (keyof typeof STRINGS.de)[]) {
    expect(String(STRINGS.pt[key]).trim(),key).not.toBe('');
    // Portuguese distant-kin appositions already contain the full label.
    if(!key.startsWith('kinLongApp_')) expect(placeholders(STRINGS.pt[key]),key).toEqual(placeholders(STRINGS.de[key]));
  }
  expect(getT('pt-BR').get('logout')).toBe('Sair');
  expect(getT('pt').getGenLabel(-8)).toContain('8');
});
it('provides English UI keys and natural cousin ordinals including teen exceptions', () => {
  expect(Object.keys(STRINGS.en).sort()).toEqual(Object.keys(STRINGS.de).sort());
  for (const value of Object.values(STRINGS.en)) expect(String(value).trim()).not.toBe('');
  for (const [n,ordinal] of [[2,'2nd'],[3,'3rd'],[4,'4th'],[11,'11th'],[12,'12th'],[13,'13th'],[21,'21st'],[22,'22nd']]) {
    expect(getT('en-GB').get('kinCousinDegree_f',{n})).toBe(`${ordinal} cousin`);
    expect(getT('en').get('kinCousinDegreeApp_u',{n})).toBe(`the ${ordinal} cousin`);
  }
});
