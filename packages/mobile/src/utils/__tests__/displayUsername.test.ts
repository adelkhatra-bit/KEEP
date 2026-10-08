import { displayUsername } from '../displayUsername';

describe('displayUsername', () => {
  it.each([
    ['adel', 'adel'],
    ['@adel', 'adel'],
    ['  @@@adel  ', 'adel'],
    [' @ @ adel ', 'adel'],
    ['@Élodie-4A', 'Élodie-4A'],
    ['', ''],
    [' @ @ ', ''],
    [null, ''],
    [undefined, ''],
    ['adel@example.com', 'adel@example.com'],
    ['  adel@example.com  ', 'adel@example.com'],
    ['@@adel@example.com', 'adel@example.com'],
    ['music@home', 'music@home'],
  ])('formats %p as %p without changing internal @', (input, expected) => {
    expect(displayUsername(input)).toBe(expected);
    expect(displayUsername(displayUsername(input))).toBe(expected);
  });
});
