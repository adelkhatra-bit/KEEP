import { updateRecognitionConsensus } from '../recognitionConsensus';

const candidate = { confidence: 0.37, title: 'I still see your smile', artist: 'RKO prods', providerIds: {}, availableOn: [] } as any;

describe('recognitionConsensus', () => {
  it('refuse un seul match faible', () => {
    const one = updateRecognitionConsensus(null, candidate, 37, 1000);
    expect(one.accepted).toBeNull();
  });

  it('accepte le même candidat répété sur deux fenêtres', () => {
    const one = updateRecognitionConsensus(null, candidate, 37, 1000);
    const two = updateRecognitionConsensus(one.state, candidate, 25, 8000);
    expect(two.accepted?.title).toBe(candidate.title);
  });

  it('ne mélange pas deux morceaux différents', () => {
    const one = updateRecognitionConsensus(null, candidate, 37, 1000);
    const two = updateRecognitionConsensus(one.state, { ...candidate, title: 'Autre morceau' }, 46, 8000);
    expect(two.accepted).toBeNull();
    expect(two.state?.hits).toBe(1);
  });
});
